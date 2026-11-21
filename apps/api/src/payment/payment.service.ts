import { setSpanAttributes, withSpan } from "../observability/tracing";
import { randomUUID } from "node:crypto";
import {
  BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus,
  Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException,
} from "@nestjs/common";
import { RateLimiter } from "../auth/rate-limit";
import { AuditService } from "../audit/audit.service";
import { KV_STORE } from "../redis/kv-store";
import type { KeyValueStore } from "../redis/kv-store";
import { PrismaService } from "../prisma/prisma.service";
import { AllGatewaysFailedError, GatewayRegistry } from "./gateway/gateway-registry";
import { PAYMENT_CONFIG } from "./payment.config";
import type { PaymentConfig } from "./payment.config";
import { PaymentSettlement } from "./payment-settlement";
import type { SettleResult } from "./payment-settlement";
import { attemptsToInquire, extendedHold, fromDbGateway, isReusable, MAX_ATTEMPTS_PER_PAYMENT, toDbGateway } from "./payment-policy";
import type { InitiateInput, VerifyInput } from "./payment.schemas";
import type { AuthUser } from "../common/decorators";

/** توضیحِ عمومی برای درگاه: هیچ داده‌ی شخصی/سلامت (نام پزشک، تخصص، دلیل مراجعه) به بیرون نمی‌رود. */
const GATEWAY_DESCRIPTION = "پرداخت نوبت - نوبتیار";

export type InitiateResult =
  | { status: "REDIRECT"; paymentUrl: string; gateway: string }
  | { status: "PAID"; paymentUrl: null; gateway: string | null };

const MESSAGES: Record<SettleResult["state"], string> = {
  PAID: "پرداخت با موفقیت انجام شد",
  PENDING: "پرداخت شما هنوز از سوی درگاه تأیید نشده است. اگر مبلغ از حساب شما کسر شده، تا چند دقیقه‌ی دیگر به‌طور خودکار بررسی و تأیید می‌شود.",
  FAILED: "پرداخت ناموفق بود یا لغو شد. مبلغ در صورت کسر، توسط بانک بازگردانده می‌شود.",
  REVIEW: "پرداخت شما برای بررسی به پشتیبانی ارجاع شد. نتیجه از طریق اعلان به شما اطلاع داده می‌شود.",
};

@Injectable()
export class PaymentService {
  private readonly log = new Logger(PaymentService.name);
  private readonly limiter: RateLimiter;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(GatewayRegistry) private readonly registry: GatewayRegistry,
    @Inject(PaymentSettlement) private readonly settlement: PaymentSettlement,
    @Inject(PAYMENT_CONFIG) private readonly cfg: PaymentConfig,
    @Inject(KV_STORE) kv: KeyValueStore,
  ) {
    this.limiter = new RateLimiter(kv);
  }

  private async throttle(kind: "initiate" | "verify", userId: string) {
    const r = await this.limiter.hit(`pay:${kind}:${userId}`, this.cfg.ratePerUserPerMin, 60);
    if (!r.allowed) throw new HttpException({ error: "too_many_requests", retryAfterSec: r.retryAfterSec }, HttpStatus.TOO_MANY_REQUESTS);
  }

  /** فقط «مبدأ» از لیست سفید؛ آدرس نهایی را سرور می‌سازد (open-redirect/callback جعلی ممکن نیست). */
  private callbackFor(appointmentId: string, requested?: string): string {
    const allowed = this.cfg.allowedCallbackOrigins;
    let origin: string | undefined;
    if (requested) {
      // P2: آدرس فرم‌شده نباید موجب 500 شود؛ فقط آدرس معتبر و در لیست سفید پذیرفته می‌شود.
      try {
        origin = new URL(requested).origin;
      } catch {
        throw new BadRequestException({ error: "callback_not_allowed" });
      }
      if (allowed.length ? !allowed.includes(origin) : origin !== this.cfg.defaultCallbackOrigin) {
        throw new BadRequestException({ error: "callback_not_allowed" });
      }
    } else origin = this.cfg.defaultCallbackOrigin;
    if (!origin) throw new BadRequestException({ error: "callback_not_allowed" });
    return `${origin}/payment/callback?appointmentId=${appointmentId}`;
  }

  // ───────────── شروع ─────────────
  /** شروع پرداخت — span ی «payment.initiate». */
  initiate(user: AuthUser, dto: InitiateInput, now: Date = new Date()): Promise<InitiateResult> {
    return withSpan("payment.initiate", { "appointment.id": dto.appointmentId }, async (span) => {
      const r = await this.initiateInner(user, dto, now);
      setSpanAttributes(span, { "payment.outcome": r.status, "payment.gateway": (r as { gateway?: string }).gateway });
      return r;
    });
  }

  private async initiateInner(user: AuthUser, dto: InitiateInput, now: Date): Promise<InitiateResult> {
    await this.throttle("initiate", user.id);
    const callbackUrl = this.callbackFor(dto.appointmentId, dto.callbackUrl);
    const ctx = { role: user.role, userId: user.id } as const;

    const read = () =>
      this.prisma.withContext(ctx, async (tx) => {
        const appt = await tx.appointment.findUnique({
          where: { id: dto.appointmentId },
          select: { id: true, patientId: true, status: true, priceRial: true, holdExpiresAt: true },
        });
        if (!appt) throw new NotFoundException();
        if (appt.patientId !== user.id) throw new ForbiddenException();
        const payment = await tx.payment.findUnique({
          where: { appointmentId: dto.appointmentId },
          select: {
            id: true, status: true, amountRial: true, gateway: true,
            attempts: { select: { id: true, status: true, createdAt: true, payUrl: true, gateway: true }, orderBy: { createdAt: "desc" }, take: 20 },
          },
        });
        return { appt, payment };
      });

    let snap = await read();
    const { appt } = snap;
    if (appt.priceRial <= 0n) throw new BadRequestException({ error: "payment_not_required" });
    if (snap.payment && snap.payment.status !== "INITIATED" && snap.payment.status !== "FAILED") {
      throw new ConflictException({ error: "already_paid" });
    }
    if (appt.status !== "PENDING_PAYMENT") throw new ConflictException({ error: "invalid_state", status: appt.status });
    if (snap.payment && snap.payment.amountRial !== appt.priceRial) throw new ConflictException({ error: "price_changed" });

    // ضد پرداخت دوباره: پیش از ساخت لینک جدید، تلاش‌های قبلیِ در انتظار را از درگاه بسنج؛ اگر پرداخت شده، همان را نهایی کن
    if (snap.payment) {
      for (const a of attemptsToInquire(snap.payment.attempts.map((x) => ({ ...x, status: x.status as never })))) {
        const r = await this.settlement.settle(a.id, "initiate", user.id, now);
        if (r.state === "PAID") return { status: "PAID", paymentUrl: null, gateway: null };
      }
      snap = await read();
      if (snap.payment && snap.payment.status !== "INITIATED" && snap.payment.status !== "FAILED") throw new ConflictException({ error: "already_paid" });
      const reuse = snap.payment?.attempts.find((a) => isReusable({ ...a, status: a.status as never }, now));
      if (reuse?.payUrl) return { status: "REDIRECT", paymentUrl: reuse.payUrl, gateway: fromDbGateway(reuse.gateway) };
      if ((snap.payment?.attempts.length ?? 0) >= MAX_ATTEMPTS_PER_PAYMENT) throw new ConflictException({ error: "too_many_payment_attempts" });
    }

    // درخواست به درگاه (بیرون از تراکنش DB) با failover
    const attemptId = randomUUID();
    let issued: Awaited<ReturnType<GatewayRegistry["requestWithFailover"]>>;
    try {
      issued = await this.registry.requestWithFailover({ orderId: attemptId, amountRial: appt.priceRial, callbackUrl, description: GATEWAY_DESCRIPTION });
    } catch (e) {
      if (e instanceof AllGatewaysFailedError) {
        this.log.error(`ALL GATEWAYS FAILED for appointment ${appt.id}: ${e.message}`);
        throw new ServiceUnavailableException({ error: "payment_unavailable" });
      }
      throw e;
    }

    // ثبت (تراکنش کاربر/RLS). تمدید نگه‌داشتن اسلات «اول» است: اگر نوبت هم‌زمان منقضی شد، همه rollback می‌شود.
    return this.prisma.withContext(ctx, async (tx) => {
      const held = await tx.appointment.updateMany({
        where: { id: appt.id, status: "PENDING_PAYMENT" },
        data: { holdExpiresAt: extendedHold(appt.holdExpiresAt, now, this.cfg.paymentHoldMin) },
      });
      if (held.count !== 1) throw new ConflictException({ error: "invalid_state" });

      let paymentId = snap.payment?.id;
      if (!paymentId) {
        const created = await tx.payment.upsert({
          where: { appointmentId: appt.id },
          update: {},
          create: { appointmentId: appt.id, amountRial: appt.priceRial, idempotencyKey: `appt-${appt.id}`, status: "INITIATED" },
          select: { id: true },
        });
        paymentId = created.id;
      }
      await tx.payment.update({ where: { id: paymentId }, data: { status: "INITIATED", gatewayRef: issued.result.authority } });
      await tx.paymentAttempt.create({
        data: {
          id: attemptId, paymentId, gateway: toDbGateway(issued.gateway), authority: issued.result.authority,
          payUrl: issued.result.payUrl, amountRial: appt.priceRial,
        },
      });
      await this.audit.logIn(tx, {
        actorId: user.id, actorRole: user.role, action: "payment.initiated", objectType: "payment", objectId: paymentId,
        meta: { attemptId, gateway: issued.gateway, amountRial: appt.priceRial.toString() },
      });
      return { status: "REDIRECT" as const, paymentUrl: issued.result.payUrl, gateway: issued.gateway };
    });
  }

  // ───────────── بازگشت از درگاه ─────────────
  /** بازگشت از درگاه — span ی «payment.verify». */
  verify(user: AuthUser, dto: VerifyInput) {
    return withSpan("payment.verify", { "appointment.id": dto.appointmentId }, () => this.verifyInner(user, dto));
  }

  private async verifyInner(user: AuthUser, dto: VerifyInput) {
    await this.throttle("verify", user.id);
    const attempt = await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.paymentAttempt.findFirst({
        where: { authority: dto.authority, payment: { appointmentId: dto.appointmentId } },
        select: { id: true, payment: { select: { appointment: { select: { patientId: true } } } } },
      }),
    );
    if (!attempt) throw new NotFoundException({ error: "payment_not_found" });
    if (attempt.payment.appointment.patientId !== user.id) throw new ForbiddenException();

    // dto.status فقط برای مشاهده‌پذیری لاگ می‌شود؛ هیچ تصمیمی از آن گرفته نمی‌شود
    this.log.debug(`callback hint (ignored): status=${dto.status ?? "-"} attempt=${attempt.id}`);
    const r = await this.settlement.settle(attempt.id, "callback", user.id);
    return { success: r.state === "PAID", state: r.state, message: MESSAGES[r.state] };
  }

  // ───────────── وضعیت ─────────────
  async getStatus(user: AuthUser, appointmentId: string) {
    return this.prisma.withContext({ role: user.role, userId: user.id }, async (tx) => {
      const appt = await tx.appointment.findUnique({ where: { id: appointmentId }, select: { patientId: true } });
      if (!appt || appt.patientId !== user.id) throw new ForbiddenException();
      const payment = await tx.payment.findUnique({
        where: { appointmentId },
        select: {
          id: true, status: true, amountRial: true, gateway: true, paidAt: true, createdAt: true, updatedAt: true,
          refunds: { select: { amountRial: true, reason: true, createdAt: true } },
          attempts: { select: { gateway: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 10 },
        },
      });
      if (!payment) return null;
      return {
        ...payment,
        amountRial: payment.amountRial.toString(),
        refunds: payment.refunds.map((r) => ({ ...r, amountRial: r.amountRial.toString() })),
      };
    });
  }
}
