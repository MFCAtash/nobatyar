import { randomUUID } from "node:crypto";
import { ConflictException, Inject, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { aad, FIELD_CRYPTO } from "../crypto";
import type { FieldCrypto } from "../crypto";
import { PrismaService } from "../prisma/prisma.service";
import { assertSafePayload } from "./push-payload";
import type { PushPayload } from "./push-payload";
import { PUSH_CONFIG } from "./push.config";
import type { PushConfig } from "./push.config";
import type { SubscribeInput } from "./push.schemas";
import { PUSH_SENDER } from "./push.sender";
import type { PushSender } from "./push.sender";
import type { AuthUser } from "../common/decorators";

/** پس از این‌همه شکست پیاپی (غیر از gone) اشتراک پاک می‌شود. */
const MAX_FAILURES = 5;

@Injectable()
export class PushService {
  private readonly log = new Logger(PushService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
    @Inject(PUSH_CONFIG) private readonly cfg: PushConfig,
    @Inject(PUSH_SENDER) private readonly sender: PushSender | null,
  ) {}

  get enabled(): boolean { return this.cfg.enabled && !!this.sender; }

  publicKey(): { publicKey: string } {
    if (!this.enabled) throw new ServiceUnavailableException({ error: "push_disabled", message: "push_disabled" });
    return { publicKey: this.cfg.publicKey! };
  }

  /** ثبت/به‌روزرسانی اشتراک (با شاخص کور از endpoint). endpoint ی مشترک با کاربر قبلی (مرورگر مشترک) به کاربر فعلی منتقل می‌شود. */
  async subscribe(user: AuthUser, dto: SubscribeInput): Promise<{ ok: true }> {
    if (!this.enabled) throw new ServiceUnavailableException({ error: "push_disabled", message: "push_disabled" });
    const hash = this.crypto.blindIndex(dto.endpoint, "push-endpoint");
    await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const mine = await tx.pushSubscription.count({ where: { userId: user.id, NOT: { endpointHash: hash } } });
      if (mine >= this.cfg.maxPerUser) throw new ConflictException({ error: "too_many_push_subscriptions", message: "too_many_push_subscriptions" });
      const existing = await tx.pushSubscription.findUnique({ where: { endpointHash: hash }, select: { id: true } });
      const id = existing?.id ?? undefined;
      const enc = (v: string, col: string, rid: string) => this.crypto.encrypt(v, aad("push_subscriptions", rid, col));
      if (existing) {
        await tx.pushSubscription.update({
          where: { id: existing.id },
          data: { userId: user.id, p256dhEnc: enc(dto.keys.p256dh, "p256dh", existing.id), authEnc: enc(dto.keys.auth, "auth", existing.id), endpointEnc: enc(dto.endpoint, "endpoint", existing.id), failureCount: 0 },
        });
      } else {
        const rid = randomUUID();
        await tx.pushSubscription.create({
          data: { id: id ?? rid, userId: user.id, endpointHash: hash, endpointEnc: enc(dto.endpoint, "endpoint", rid), p256dhEnc: enc(dto.keys.p256dh, "p256dh", rid), authEnc: enc(dto.keys.auth, "auth", rid) },
        });
      }
    });
    return { ok: true };
  }

  async unsubscribe(user: AuthUser, endpoint: string): Promise<{ ok: true }> {
    const hash = this.crypto.blindIndex(endpoint, "push-endpoint");
    await this.prisma.withContext({ role: "SYSTEM" }, (tx) => tx.pushSubscription.deleteMany({ where: { endpointHash: hash, userId: user.id } }));
    return { ok: true };
  }

  /** ارسال به همه‌ی دستگاه‌های یک کاربر؛ best-effort (هیچ‌وقت throw نمی‌کند). */
  async sendToUser(userId: string, payload: PushPayload): Promise<{ sent: number; removed: number }> {
    if (!this.enabled) return { sent: 0, removed: 0 };
    assertSafePayload(payload);
    const json = JSON.stringify(payload);
    const subs = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.pushSubscription.findMany({ where: { userId }, select: { id: true, endpointEnc: true, p256dhEnc: true, authEnc: true, failureCount: true }, take: 50 }),
    );
    let sent = 0, removed = 0;
    for (const s of subs) {
      try {
        const dec = (b: Uint8Array, col: string) => this.crypto.decrypt(b, aad("push_subscriptions", s.id, col)).toString("utf8");
        const r = await this.sender!.send({ endpoint: dec(s.endpointEnc, "endpoint"), p256dh: dec(s.p256dhEnc, "p256dh"), auth: dec(s.authEnc, "auth") }, json);
        if (r.ok) {
          sent++;
          await this.prisma.withContext({ role: "SYSTEM" }, (tx) => tx.pushSubscription.updateMany({ where: { id: s.id }, data: { lastSuccessAt: new Date(), failureCount: 0 } }));
        } else if (r.gone || s.failureCount + 1 >= MAX_FAILURES) {
          removed++;
          await this.prisma.withContext({ role: "SYSTEM" }, (tx) => tx.pushSubscription.deleteMany({ where: { id: s.id } }));
        } else {
          await this.prisma.withContext({ role: "SYSTEM" }, (tx) => tx.pushSubscription.updateMany({ where: { id: s.id }, data: { failureCount: { increment: 1 } } }));
        }
      } catch (e) {
        this.log.warn(`push to subscription ${s.id} failed: ${(e as Error).name}`); // بدون پیام خطا (ممکن است endpoint داشته باشد)
      }
    }
    return { sent, removed };
  }
}
