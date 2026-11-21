import type { EventPayload, EventType, StoredEvent } from "./outbox-events";
import { EVENT_SCHEMAS } from "./outbox-events";
import type { HandlerMap } from "./outbox.relay";
import { uuidFromKey } from "./outbox-policy";

export type NotifyKind = "APPOINTMENT_CONFIRMED" | "APPOINTMENT_CANCELLED" | "APPOINTMENT_RESCHEDULED" | "PAYMENT_SUCCESS" | "PAYMENT_FAILED" | "SYSTEM";

export interface Delivery {
  userId: string;
  /** شناسه‌ی قطعی ⇒ تحویل دوباره‌ی همان رویداد اعلان تکراری نمی‌سازد */
  notificationId: string;
  kind: NotifyKind;
  titleFa: string;
  bodyFa: string;
  payload: Record<string, unknown>;
}
/** باید در صورت شکست «throw» کند تا relay دوباره امتحان کند. */
export type Deliver = (d: Delivery) => Promise<void>;

const parse = <T extends EventType>(type: T, e: StoredEvent): EventPayload<T> => EVENT_SCHEMAS[type].parse(e.payload) as EventPayload<T>;
const say = (e: StoredEvent, recipient: string, userId: string, kind: NotifyKind, titleFa: string, bodyFa: string, appointmentId: string): Delivery =>
  ({ userId, notificationId: uuidFromKey(`${e.id}:${recipient}`), kind, titleFa, bodyFa, payload: { appointmentId } });

/** متن‌ها همان متن‌های پیشین‌اند (بدون داده‌ی سلامت). */
export function buildHandlers(deliver: Deliver): Required<HandlerMap> {
  return {
    "payment.settled": async (e) => { const p = parse("payment.settled", e); await deliver(say(e, "patient", p.patientId, "PAYMENT_SUCCESS", "پرداخت موفق", "پرداخت نوبت شما با موفقیت انجام شد.", p.appointmentId)); },
    "payment.failed": async (e) => { const p = parse("payment.failed", e); await deliver(say(e, "patient", p.patientId, "PAYMENT_FAILED", "پرداخت ناموفق", "تراکنش توسط درگاه تأیید نشد. مبلغ در صورت کسر، توسط بانک بازگردانده می‌شود.", p.appointmentId)); },
    "payment.needs_review": async (e) => { const p = parse("payment.needs_review", e); await deliver(say(e, "patient", p.patientId, "SYSTEM", "پرداخت در حال بررسی", "پرداخت شما نیاز به بررسی پشتیبانی دارد. اگر مبلغی کسر شده، پس از بررسی تعیین تکلیف می‌شود.", p.appointmentId)); },
    "payment.duplicate": async (e) => { const p = parse("payment.duplicate", e); await deliver(say(e, "patient", p.patientId, "SYSTEM", "پرداخت تکراری", "پرداخت دوم برای همین نوبت انجام شد؛ مبلغ آن به‌زودی بازگردانده می‌شود.", p.appointmentId)); },
    "payment.late_refund": async (e) => { const p = parse("payment.late_refund", e); await deliver(say(e, "patient", p.patientId, "SYSTEM", "پرداخت پس از پایان مهلت", "پرداخت شما پس از پایان مهلت نگه‌داشتن وقت رسید و نوبت ثبت نشد. مبلغ کامل به‌زودی بازگردانده می‌شود.", p.appointmentId)); },
    "refund.processed": async (e) => { const p = parse("refund.processed", e); await deliver(say(e, "patient", p.patientId, "SYSTEM", "بازپرداخت ثبت شد", "مبلغ بازپرداخت شما ثبت شد و طبق زمان‌بندی بانکی به حساب شما برمی‌گردد.", p.appointmentId)); },

    "appointment.status_changed": async (e) => {
      const p = parse("appointment.status_changed", e);
      const d = statusChangeDelivery(e, p);
      if (d) await deliver(d);
    },
    "appointment.rescheduled": async (e) => {
      const p = parse("appointment.rescheduled", e);
      const d = say(e, "patient", p.patientId, "APPOINTMENT_RESCHEDULED", "زمان نوبت تغییر کرد", "زمان نوبت شما توسط طرف مقابل تغییر یافت. لطفاً جزئیات نوبت را بررسی کنید.", p.appointmentId);
      await deliver(d);
      const d2 = say(e, "doctor", p.doctorId, "APPOINTMENT_RESCHEDULED", "زمان نوبت تغییر کرد", "زمان یک نوبت تغییر یافت. لطفاً تقویم خود را بررسی کنید.", p.appointmentId);
      if (p.doctorId !== p.actorId) await deliver(d2);
    },
    "scribe.draft_generated": async (e) => { /* اعلان توسط سرویس Scribe انجام میشود؛ رویداد برای ممیزی/API عمومی است */ void e; },
  };
}

/** چه کسی از تغییر وضعیت نوبت باخبر شود (پرداخت موفق را «payment.settled» خبر می‌دهد؛ اینجا تکرار نمی‌شود). */
export function statusChangeDelivery(e: StoredEvent, p: EventPayload<"appointment.status_changed">): Delivery | null {
  switch (p.to) {
    case "PENDING_CONFIRMATION":
      return say(e, "doctor", p.doctorId, "SYSTEM", "درخواست نوبت جدید", "یک درخواست نوبت جدید منتظر تأیید شماست.", p.appointmentId);
    case "CONFIRMED":
      return p.from === "PENDING_CONFIRMATION" ? say(e, "patient", p.patientId, "APPOINTMENT_CONFIRMED", "نوبت تأیید شد", "پزشک نوبت شما را تأیید کرد.", p.appointmentId) : null;
    case "CANCELLED_BY_DOCTOR":
      return say(e, "patient", p.patientId, "APPOINTMENT_CANCELLED", "نوبت لغو شد", "نوبت شما توسط پزشک لغو شد. در صورت پرداخت، مبلغ بازگردانده می‌شود.", p.appointmentId);
    case "CANCELLED_BY_PATIENT":
      return say(e, "doctor", p.doctorId, "APPOINTMENT_CANCELLED", "نوبت لغو شد", "یکی از نوبت‌های شما توسط بیمار لغو شد.", p.appointmentId);
    case "EXPIRED":
      return p.from === "PENDING_PAYMENT" ? say(e, "patient", p.patientId, "SYSTEM", "مهلت پرداخت تمام شد", "مهلت پرداخت نوبت به پایان رسید و وقت آزاد شد.", p.appointmentId) : null;
    default:
      return null;
  }
}
