import type { Logger } from "@nestjs/common";
import type { AuditService } from "../../audit/audit.service";
import type { OutboxWriter } from "../../outbox/outbox.service";
import type { PrismaService } from "../../prisma/prisma.service";
import { paymentOutcomes } from "../../observability/metrics";
import { aggregateUnpaidStatus } from "../payment-policy";
import type { AttemptRow, SettleResult } from "./types";

/**
 * بستن تلاش پرداخت (FAILED / EXPIRED) و علامت‌گذاری MISMATCH.
 * اعلان به بیمار «داخل همان تراکنشِ» تغییر وضعیت در Outbox ثبت می‌شود؛ فقط برنده‌ی رقابت (count === 1) اعلان می‌سازد
 * (پیش‌تر: بازنده‌ی رقابت هم اعلان تکراری می‌فرستاد).
 */
export class AttemptCloser {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxWriter,
    private readonly log: Logger,
  ) {}

  async close(a: AttemptRow, status: "FAILED" | "EXPIRED", code: string, now: Date, notifyPatient: boolean): Promise<void> {
    await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const c = await tx.paymentAttempt.updateMany({ where: { id: a.id, status: "INITIATED" }, data: { status, failureCode: code.slice(0, 64), lastCheckedAt: now } });
      if (c.count !== 1) return;
      paymentOutcomes.inc({ outcome: status.toLowerCase() });
      const all = await tx.paymentAttempt.findMany({ where: { paymentId: a.paymentId }, select: { status: true } });
      const agg = aggregateUnpaidStatus(all as { status: "INITIATED" | "VERIFIED" | "FAILED" | "EXPIRED" | "MISMATCH" }[]);
      if (agg === "FAILED") await tx.payment.updateMany({ where: { id: a.paymentId, status: "INITIATED" }, data: { status: "FAILED" } });
      await this.audit.logIn(tx, {
        actorId: null, actorRole: "SYSTEM", action: `payment.attempt_${status.toLowerCase()}`, objectType: "payment", objectId: a.paymentId,
        meta: { attemptId: a.id, gateway: a.gateway, code: code.slice(0, 64) },
      });
      if (notifyPatient) {
        await this.outbox.enqueue(tx, { type: "payment.failed", aggregateType: "payment", aggregateId: a.paymentId, payload: { appointmentId: a.payment.appointmentId, patientId: a.payment.appointment.patientId } });
      }
    });
  }

  async markMismatch(a: AttemptRow, code: string, gatewayAmount: bigint | undefined, now: Date): Promise<SettleResult> {
    const flagged = await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const c = await tx.paymentAttempt.updateMany({ where: { id: a.id, status: "INITIATED" }, data: { status: "MISMATCH", failureCode: code.slice(0, 64), lastCheckedAt: now } });
      if (c.count !== 1) return false;
      await this.audit.logIn(tx, {
        actorId: null, actorRole: "SYSTEM", action: "payment.needs_review", objectType: "payment", objectId: a.paymentId,
        meta: { attemptId: a.id, gateway: a.gateway, code, expectedRial: a.amountRial.toString(), gatewayRial: gatewayAmount?.toString() ?? null },
      });
      await this.outbox.enqueue(tx, { type: "payment.needs_review", aggregateType: "payment", aggregateId: a.paymentId, payload: { appointmentId: a.payment.appointmentId, patientId: a.payment.appointment.patientId } });
      return true;
    });
    if (flagged) paymentOutcomes.inc({ outcome: "mismatch" });
    if (flagged) this.log.error(`PAYMENT NEEDS REVIEW attempt=${a.id} payment=${a.paymentId} gateway=${a.gateway} code=${code}`);
    return { state: "REVIEW", code };
  }
}
