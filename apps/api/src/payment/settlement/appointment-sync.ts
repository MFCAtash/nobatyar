import { ConflictException, type Logger } from "@nestjs/common";
import type { AppointmentsService } from "../../appointments/appointments.service";
import type { AuditService } from "../../audit/audit.service";
import type { OutboxWriter } from "../../outbox/outbox.service";
import type { PrismaService } from "../../prisma/prisma.service";
import { planAppointmentSync } from "../payment-policy";

export type SyncResult = "CONFIRMED" | "REFUNDED" | "SYNCED" | "SKIPPED";

/**
 * هماهنگی نوبت با پرداختِ PAID — ایدمپوتنت و قابل‌تکرار (job ترمیم هم از همین استفاده می‌کند).
 * نوبت منتظر پرداخت ⇒ PAYMENT_SUCCEEDED؛ نوبتِ منقضی/لغوشده ⇒ بازپرداخت کامل خودکار.
 * «appointmentSyncedAt» و رویداد Outbox ی اعلان در یک تراکنش نوشته می‌شوند ⇒ یا هر دو یا هیچ‌کدام.
 */
export class AppointmentSync {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxWriter,
    private readonly appointments: AppointmentsService,
    private readonly log: Logger,
  ) {}

  async sync(paymentId: string, now: Date = new Date(), depth = 0): Promise<SyncResult> {
    const p = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.payment.findUnique({
        where: { id: paymentId },
        select: { id: true, status: true, amountRial: true, appointmentSyncedAt: true, appointmentId: true, appointment: { select: { status: true, patientId: true } } },
      }),
    );
    if (!p || p.appointmentSyncedAt || !["PAID", "REFUNDED", "PARTIALLY_REFUNDED"].includes(p.status)) return "SKIPPED";

    const plan = planAppointmentSync(p.appointment.status);
    if (plan.action === "CONFIRM") {
      try {
        await this.appointments.apply({ kind: "system" }, p.appointmentId, "PAYMENT_SUCCEEDED", now);
      } catch (e) {
        // نوبت هم‌زمان تغییر کرد (منقضی/لغو/تأیید) ⇒ یک‌بار دیگر با وضعیت تازه تصمیم بگیر
        if (e instanceof ConflictException && depth < 2) return this.sync(paymentId, now, depth + 1);
        throw e;
      }
      await this.markSynced(paymentId, now, { appointmentId: p.appointmentId, patientId: p.appointment.patientId });
      return "CONFIRMED";
    }
    if (plan.action === "MARK_SYNCED") {
      await this.markSynced(paymentId, now);
      return "SYNCED";
    }
    await this.refundLate({ id: p.id, amountRial: p.amountRial, appointmentId: p.appointmentId, patientId: p.appointment.patientId }, now);
    return "REFUNDED";
  }

  private async markSynced(paymentId: string, now: Date, notify?: { appointmentId: string; patientId: string }): Promise<void> {
    await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const r = await tx.payment.updateMany({ where: { id: paymentId, appointmentSyncedAt: null }, data: { appointmentSyncedAt: now } });
      if (r.count === 1 && notify) await this.outbox.enqueue(tx, { type: "payment.settled", aggregateType: "payment", aggregateId: paymentId, payload: notify });
    });
  }

  /** پرداخت رسید ولی نوبت دیگر قابل‌تأیید نیست ⇒ بازپرداخت کامل (فقط یک‌بار، با به‌روزرسانی شرطی). */
  private async refundLate(p: { id: string; amountRial: bigint; appointmentId: string; patientId: string }, now: Date): Promise<void> {
    const claimed = await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const c = await tx.payment.updateMany({ where: { id: p.id, status: "PAID" }, data: { status: "REFUNDED" } });
      if (c.count === 1) {
        await tx.refund.create({ data: { paymentId: p.id, amountRial: p.amountRial, reason: "PAID_AFTER_EXPIRY" } });
        await this.audit.logIn(tx, {
          actorId: null, actorRole: "SYSTEM", action: "payment.late_paid_refund", objectType: "payment", objectId: p.id,
          meta: { appointmentId: p.appointmentId, amountRial: p.amountRial.toString() },
        });
        await this.outbox.enqueue(tx, { type: "payment.late_refund", aggregateType: "payment", aggregateId: p.id, payload: { appointmentId: p.appointmentId, patientId: p.patientId } });
      }
      await tx.payment.updateMany({ where: { id: p.id, appointmentSyncedAt: null }, data: { appointmentSyncedAt: now } });
      return c.count === 1;
    });
    if (claimed) this.log.warn(`payment ${p.id} arrived after appointment ${p.appointmentId} was closed: full refund queued`);
  }
}
