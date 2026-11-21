import { setSpanAttributes, withSpan } from "../observability/tracing";
import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AppointmentsService } from "../appointments/appointments.service";
import { AuditService } from "../audit/audit.service";
import { paymentOutcomes } from "../observability/metrics";
import { OUTBOX_WRITER, type OutboxWriter } from "../outbox/outbox.service";
import { PrismaService } from "../prisma/prisma.service";
import { GatewayRegistry } from "./gateway/gateway-registry";
import type { VerifyOutcome } from "./gateway/gateway";
import { PAYMENT_CONFIG } from "./payment.config";
import type { PaymentConfig } from "./payment.config";
import { checkPaid, fromDbGateway } from "./payment-policy";
import { AppointmentSync } from "./settlement/appointment-sync";
import { AttemptCloser } from "./settlement/attempt-closer";
import { handleNotPaid } from "./settlement/not-paid-handler";
import { ATTEMPT_SELECT } from "./settlement/types";
import type { AttemptRow, SettleResult, SettleSource } from "./settlement/types";

export type { SettleResult, SettleSource, SettleState } from "./settlement/types";

/**
 * هسته‌ی «تسویه»ی پرداخت — تنها جایی که Payment به PAID می‌رود. هم callback مرورگر و هم job بازبینی از همین مسیر عبور می‌کنند.
 *
 * تضمین‌ها:
 *  ۱) فقط پاسخ «سرور درگاه» (verify) تعیین‌کننده است؛ پارامتر Status مرورگر هیچ نقشی ندارد.
 *  ۲) مبلغ DB با مبلغ درگاه مطابقت داده می‌شود؛ ناهمخوانی ⇒ MISMATCH و بررسی دستی، هرگز تأیید.
 *  ۳) تماس شبکه «بیرون از تراکنش DB» است؛ تغییر وضعیت با به‌روزرسانی شرطی (INITIATED → VERIFIED) انجام می‌شود تا
 *     callback و job هم‌زمان فقط «یک‌بار» برنده شوند (ایدمپوتنت).
 *  ۴) اگر بین «تأیید درگاه» و «تأیید نوبت» پروسه بمیرد، appointmentSyncedAt=null می‌ماند و job ترمیم دوباره هماهنگ می‌کند.
 *  ۵) پرداخت پس از انقضای نوبت ⇒ بازپرداخت کامل خودکار؛ پرداخت تکراری ⇒ بازپرداخت همان مبلغ.
 *  ۶) اعلان‌ها با الگوی Outbox: رویداد در «همان تراکنشِ» تغییر وضعیت نوشته می‌شود (src/outbox).
 *
 * ساختار فایل‌ها (فاز ۱۷): این کلاس فقط ارکستراسیون است؛ جزئیات در settlement/ —
 *   attempt-closer.ts (بستن/MISMATCH)، appointment-sync.ts (هماهنگی نوبت)، not-paid-handler.ts (تصمیم پس از «پرداخت‌نشده»).
 */
@Injectable()
export class PaymentSettlement {
  private readonly log = new Logger(PaymentSettlement.name);
  private readonly closer: AttemptCloser;
  private readonly sync: AppointmentSync;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OUTBOX_WRITER) private readonly outbox: OutboxWriter,
    @Inject(AppointmentsService) appointments: AppointmentsService,
    @Inject(GatewayRegistry) private readonly registry: GatewayRegistry,
    @Inject(PAYMENT_CONFIG) private readonly cfg: PaymentConfig,
  ) {
    this.closer = new AttemptCloser(prisma, audit, outbox, this.log);
    this.sync = new AppointmentSync(prisma, audit, outbox, appointments, this.log);
  }

  /** هماهنگی نوبت با پرداخت (job ترمیم و callback). */
  syncAppointment(paymentId: string, now: Date = new Date(), depth = 0) {
    return this.sync.sync(paymentId, now, depth);
  }

  // ───────────── ورودی اصلی ─────────────
  /** تسویه — span ی «payment.settle» با نتیجه. */
  settle(attemptId: string, source: SettleSource, actorId: string | null = null, now: Date = new Date()): Promise<SettleResult> {
    return withSpan("payment.settle", { "payment.attempt_id": attemptId, "payment.source": source }, async (span) => {
      const r = await this.settleInner(attemptId, source, actorId, now);
      setSpanAttributes(span, { "payment.state": r.state });
      return r;
    });
  }

  private async settleInner(attemptId: string, source: SettleSource, actorId: string | null, now: Date): Promise<SettleResult> {
    const a = (await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.paymentAttempt.findUnique({ where: { id: attemptId }, select: ATTEMPT_SELECT }),
    )) as AttemptRow | null;
    if (!a) throw new NotFoundException();

    switch (a.status) {
      case "VERIFIED":
        await this.sync.sync(a.paymentId, now); // ترمیم: شاید پروسه‌ی قبلی پیش از هماهنگی با نوبت مُرد
        return { state: "PAID" };
      case "FAILED":
      case "EXPIRED":
        return { state: "FAILED", code: "attempt_closed" };
      case "MISMATCH":
        return { state: "REVIEW", code: "needs_review" };
    }

    // دفاع در عمق: attempt ی SANDBOX در production هرگز verify نمی‌شود (حتی اگر داده‌ی قدیمی در DB مانده باشد)
    if (this.cfg.isProduction && a.gateway === "SANDBOX") {
      await this.closer.close(a, "FAILED", "sandbox_in_production", now, false);
      this.log.error(`sandbox attempt ${a.id} refused in production`);
      return { state: "FAILED", code: "sandbox_in_production" };
    }

    const gw = this.registry.get(fromDbGateway(a.gateway));
    if (!gw) {
      this.log.error(`gateway ${a.gateway} is not configured; attempt ${a.id} stays pending`);
      return { state: "PENDING", code: "gateway_not_configured" };
    }

    let outcome: VerifyOutcome;
    try {
      outcome = await gw.verify({ authority: a.authority, orderId: a.id, amountRial: a.amountRial });
    } catch (e) {
      this.log.warn(`verify failed (${a.gateway}) attempt=${a.id}: ${(e as Error).message}`);
      return { state: "PENDING", code: "gateway_unavailable" }; // job دوباره امتحان می‌کند
    }
    return this.handleOutcome(a, outcome, source, actorId, now, true);
  }

  private async handleOutcome(a: AttemptRow, outcome: VerifyOutcome, source: SettleSource, actorId: string | null, now: Date, allowRetry: boolean): Promise<SettleResult> {
    switch (outcome.kind) {
      case "PAID": {
        const d = checkPaid(outcome, a.amountRial, a.payment.amountRial);
        if (!d.ok) return this.closer.markMismatch(a, d.code, outcome.amountRial, now);
        return this.commitPaid(a, outcome, source, actorId, now);
      }
      case "MISMATCH":
        return this.closer.markMismatch(a, outcome.code, outcome.gatewayAmountRial, now);
      case "NOT_PAID":
        return handleNotPaid(
          { registry: this.registry, closer: this.closer, giveUpHours: this.cfg.attemptGiveUpHours, log: this.log, retryVerify: (att) => this.retryVerify(att, source, actorId, now) },
          a, outcome.code, source, now, allowRetry,
        );
    }
  }

  /** درگاه می‌گوید پرداخت شده ولی verify «نشده» گفت: یک بار دیگر verify (بدون retry ی بعدی). */
  private async retryVerify(a: AttemptRow, source: SettleSource, actorId: string | null, now: Date): Promise<SettleResult> {
    const gw = this.registry.get(fromDbGateway(a.gateway))!;
    try {
      const again = await gw.verify({ authority: a.authority, orderId: a.id, amountRial: a.amountRial });
      return await this.handleOutcome(a, again, source, actorId, now, false);
    } catch (e) {
      this.log.warn(`verify retry failed attempt=${a.id}: ${(e as Error).message}`);
      return { state: "PENDING", code: "gateway_unavailable" };
    }
  }

  // ───────────── موفق ─────────────
  private async commitPaid(a: AttemptRow, o: Extract<VerifyOutcome, { kind: "PAID" }>, source: SettleSource, actorId: string | null, now: Date): Promise<SettleResult> {
    const res = await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      // رقابت: callback و job هم‌زمان ⇒ فقط یکی INITIATED → VERIFIED می‌شود
      const won = await tx.paymentAttempt.updateMany({
        where: { id: a.id, status: "INITIATED" },
        data: { status: "VERIFIED", refId: o.refId, cardPanMasked: o.cardPanMasked ?? null, feeRial: o.feeRial ?? null, verifiedAt: now, failureCode: null, lastCheckedAt: now },
      });
      if (won.count !== 1) return "raced" as const;

      const upd = await tx.payment.updateMany({
        where: { id: a.paymentId, status: { in: ["INITIATED", "FAILED"] } },
        data: { status: "PAID", gateway: a.gateway as never, gatewayRef: a.authority, paidAt: now },
      });
      if (upd.count === 1) {
        await this.audit.logIn(tx, {
          actorId, actorRole: actorId ? "PATIENT" : "SYSTEM", action: "payment.verified", objectType: "payment", objectId: a.paymentId,
          meta: { attemptId: a.id, gateway: a.gateway, source, amountRial: a.amountRial.toString(), alreadyVerified: o.alreadyVerified },
        });
        return "paid" as const;
      }
      // Payment قبلاً با تلاش دیگری PAID شده ⇒ این پرداخت «تکراری» است؛ همان مبلغ بازپرداخت می‌شود
      await tx.refund.create({ data: { paymentId: a.paymentId, attemptId: a.id, gateway: a.gateway as never, amountRial: a.amountRial, reason: "DUPLICATE_PAYMENT" } });
      await this.audit.logIn(tx, {
        actorId, actorRole: actorId ? "PATIENT" : "SYSTEM", action: "payment.duplicate_paid", objectType: "payment", objectId: a.paymentId,
        meta: { attemptId: a.id, gateway: a.gateway, source, amountRial: a.amountRial.toString() },
      });
      await this.outbox.enqueue(tx, { type: "payment.duplicate", aggregateType: "payment", aggregateId: a.paymentId, payload: { appointmentId: a.payment.appointmentId, patientId: a.payment.appointment.patientId } });
      return "duplicate" as const;
    });

    if (res === "raced") return { state: "PAID" }; // برنده‌ی رقابت هماهنگی با نوبت را انجام می‌دهد (و ترمیم پشتوانه است)
    paymentOutcomes.inc({ outcome: res }); // "paid" | "duplicate" (raced برگشته)
    if (res === "duplicate") {
      this.log.error(`DUPLICATE payment attempt=${a.id} payment=${a.paymentId}: refund queued`);
      return { state: "PAID", code: "duplicate" };
    }
    await this.sync.sync(a.paymentId, now);
    return { state: "PAID" };
  }
}
