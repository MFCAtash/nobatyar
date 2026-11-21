import { z } from "zod";

const id = z.string().min(1).max(64);
const base = z.object({ appointmentId: id, patientId: id }).strict();

/** فهرست رویدادها و شکل payload ها. فقط شناسه می‌گیرند؛ هرگز داده‌ی سلامت/نام. */
export const EVENT_SCHEMAS = {
  "payment.settled": base,
  "payment.failed": base,
  "payment.needs_review": base,
  "payment.duplicate": base,
  "payment.late_refund": base,
  "refund.processed": base,
  "appointment.status_changed": z.object({
    appointmentId: id, patientId: id, doctorId: id,
    from: z.string().min(1).max(40), to: z.string().min(1).max(40), action: z.string().min(1).max(40),
  }).strict(),
  /// فاز ۱۹: جابهجایی — فقط شناسهها و زمانها؛ بدون دلیل مراجعه/تشخیص
  "appointment.rescheduled": z.object({
    appointmentId: id, patientId: id, doctorId: id, actorId: id,
    from: z.string().datetime(), to: z.string().datetime(),
  }).strict(),
  /// فاز ۱۹: فقط شناسهها؛ هیچ متن گفتار/پیشنویس در Outbox قرار نمیگیرد
  "scribe.draft_generated": z.object({ appointmentId: id, patientId: id, doctorId: id }).strict(),
} as const;

export type EventType = keyof typeof EVENT_SCHEMAS;
export type EventPayload<T extends EventType> = z.infer<(typeof EVENT_SCHEMAS)[T]>;
export type AggregateType = "payment" | "refund" | "appointment";

export interface DomainEvent<T extends EventType = EventType> {
  type: T;
  aggregateType: AggregateType;
  aggregateId: string;
  payload: EventPayload<T>;
}

export interface StoredEvent {
  id: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  attempts: number;
  createdAt: Date;
}

export const isEventType = (t: string): t is EventType => Object.prototype.hasOwnProperty.call(EVENT_SCHEMAS, t);

/** اعتبارسنجی هنگام نوشتن (خطای برنامه‌نویسی همان لحظه و داخل تراکنش دیده شود، نه ساعت‌ها بعد در relay). */
export function validateEvent<T extends EventType>(e: DomainEvent<T>): DomainEvent<T> {
  const r = EVENT_SCHEMAS[e.type].safeParse(e.payload);
  if (!r.success) throw new Error(`invalid outbox payload for ${e.type}: ${r.error.issues.map((i) => i.path.join(".")).join(",")}`);
  return e;
}
