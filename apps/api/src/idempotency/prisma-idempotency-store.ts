import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { decide, type StoredKey } from "./idempotency-policy";
import type { BeginResult, IdempotencyStore } from "./idempotency-store";

type Row = { fingerprint: string; state: string; lockedUntil: Date; expiresAt: Date; statusCode: number | null; response: Prisma.JsonValue | null };
const toStored = (r: Row): StoredKey => ({ fingerprint: r.fingerprint, state: r.state === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS", lockedUntil: r.lockedUntil, expiresAt: r.expiresAt, statusCode: r.statusCode, response: r.response });

/** ذخیره‌ی ماندگار (Postgres): بقای کلید پس از ری‌استارت و هم‌زمانی بین چند نمونه‌ی API. فقط با نقش SYSTEM. */
export class PrismaIdempotencyStore implements IdempotencyStore {
  constructor(private readonly prisma: Pick<PrismaService, "withContext">) {}

  begin(scope: string, key: string, fp: string, lockMs: number, ttlMs: number, now: Date): Promise<BeginResult> {
    const lockedUntil = new Date(now.getTime() + lockMs);
    const expiresAt = new Date(now.getTime() + ttlMs);
    return this.prisma.withContext({ role: "SYSTEM" }, async (tx): Promise<BeginResult> => {
      for (let i = 0; i < 3; i++) {
        // INSERT ... ON CONFLICT DO NOTHING: برنده‌ی رقابت دقیقاً یک درخواست است
        const created = await tx.idempotencyKey.createMany({ data: [{ scope, key, fingerprint: fp, state: "IN_PROGRESS", lockedUntil, expiresAt }], skipDuplicates: true });
        if (created.count === 1) return { kind: "acquired" };

        const ex = await tx.idempotencyKey.findUnique({ where: { scope_key: { scope, key } } });
        if (!ex) continue; // هم‌زمان حذف شد؛ دوباره
        const d = decide(toStored(ex as Row), fp, now);
        if (d.kind === "execute") { // ردیف منقضی
          await tx.idempotencyKey.deleteMany({ where: { scope, key, expiresAt: { lte: now } } });
          continue;
        }
        if (d.kind === "takeover") {
          const won = await tx.idempotencyKey.updateMany({ where: { scope, key, state: "IN_PROGRESS", lockedUntil: { lte: now } }, data: { lockedUntil, expiresAt } });
          if (won.count === 1) return { kind: "acquired" };
          continue;
        }
        return d;
      }
      return { kind: "in_progress", retryAfterSec: 1 };
    });
  }

  async complete(scope: string, key: string, status: number, body: unknown, now: Date): Promise<void> {
    await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.idempotencyKey.updateMany({
        where: { scope, key, state: "IN_PROGRESS" },
        data: { state: "COMPLETED", statusCode: status, response: JSON.parse(JSON.stringify(body ?? null)) as Prisma.InputJsonValue, completedAt: now },
      }),
    );
  }

  async release(scope: string, key: string): Promise<void> {
    await this.prisma.withContext({ role: "SYSTEM" }, (tx) => tx.idempotencyKey.deleteMany({ where: { scope, key, state: "IN_PROGRESS" } }));
  }

  async purgeExpired(now: Date): Promise<number> {
    const r = await this.prisma.withContext({ role: "SYSTEM" }, (tx) => tx.idempotencyKey.deleteMany({ where: { expiresAt: { lte: now } } }));
    return r.count;
  }
}
