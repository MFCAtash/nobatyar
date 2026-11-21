/**
 * سیاست «نظر دوم» — توابع خالص (بدون I/O).
 * جریان: بیمار روی نوبتِ COMPLETED خودش از پزشکِ «دیگر» نظر می‌خواهد ⇒ پزشک مهلت‌دار می‌پذیرد/رد می‌کند ⇒ پاسخ می‌دهد.
 * حریم خصوصی: پزشک دوم نام/موبایل بیمار را نمی‌بیند (فقط سن/جنسیت/خلاصه‌ی مورد که بیمار خودش نوشته)؛
 * پرونده‌ها فقط با اشتراک زمان‌دار و مشخصِ بیمار دیده می‌شوند.
 */
export const SO_STATUSES = ["REQUESTED", "ACCEPTED", "DECLINED", "ANSWERED", "EXPIRED", "CANCELLED"] as const;
export type SoStatus = (typeof SO_STATUSES)[number];
export type SoAction = "ACCEPT" | "DECLINE" | "ANSWER" | "CANCEL" | "EXPIRE";
export const SO_ACTOR: Record<SoAction, "doctor" | "patient" | "system"> = {
  ACCEPT: "doctor", DECLINE: "doctor", ANSWER: "doctor", CANCEL: "patient", EXPIRE: "system",
};
export const SO_TERMINAL: readonly SoStatus[] = ["DECLINED", "ANSWERED", "EXPIRED", "CANCELLED"];
/** پایان بدون پاسخ ⇒ اشتراک پرونده‌ها باید فوراً لغو شود. */
export const SO_REVOKES_SHARES: readonly SoStatus[] = ["DECLINED", "EXPIRED", "CANCELLED"];

export interface SoConfig {
  acceptWithinHours: number;   // مهلت پذیرش پزشک از لحظه‌ی درخواست
  answerWithinHours: number;   // مهلت پاسخ پس از پذیرش
  requestWindowDays: number;   // درخواست فقط تا این‌قدر پس از پایان نوبت
  maxOpenPerPatient: number;
  maxPerAppointment: number;
  maxSharedRecords: number;
  shareExtraDays: number;      // نگه‌داشتن اشتراک پس از آخرین مهلت (برای مرور پاسخ)
}
export const DEFAULT_SO_CONFIG: SoConfig = {
  acceptWithinHours: 48, answerWithinHours: 72, requestWindowDays: 30, maxOpenPerPatient: 3, maxPerAppointment: 3, maxSharedRecords: 10, shareExtraDays: 7,
};

export interface SoFacts { status: SoStatus; acceptDeadlineAt: Date; answerDeadlineAt: Date | null }
export type SoPlanError = "invalid_state" | "deadline_passed" | "not_yet_due";
export type SoPlan =
  | { ok: true; to: SoStatus; answerDeadlineAt?: Date }
  | { ok: false; error: SoPlanError };

const H = 3_600_000;

export function planSoAction(action: SoAction, f: SoFacts, now: Date, cfg: SoConfig = DEFAULT_SO_CONFIG): SoPlan {
  const t = now.getTime();
  switch (action) {
    case "ACCEPT":
      if (f.status !== "REQUESTED") return { ok: false, error: "invalid_state" };
      if (t >= f.acceptDeadlineAt.getTime()) return { ok: false, error: "deadline_passed" };
      return { ok: true, to: "ACCEPTED", answerDeadlineAt: new Date(t + cfg.answerWithinHours * H) };
    case "DECLINE":
      if (f.status !== "REQUESTED") return { ok: false, error: "invalid_state" };
      if (t >= f.acceptDeadlineAt.getTime()) return { ok: false, error: "deadline_passed" };
      return { ok: true, to: "DECLINED" };
    case "ANSWER":
      if (f.status !== "ACCEPTED" || !f.answerDeadlineAt) return { ok: false, error: "invalid_state" };
      if (t >= f.answerDeadlineAt.getTime()) return { ok: false, error: "deadline_passed" };
      return { ok: true, to: "ANSWERED" };
    case "CANCEL":
      return f.status === "REQUESTED" || f.status === "ACCEPTED" ? { ok: true, to: "CANCELLED" } : { ok: false, error: "invalid_state" };
    case "EXPIRE":
      if (f.status === "REQUESTED") return t >= f.acceptDeadlineAt.getTime() ? { ok: true, to: "EXPIRED" } : { ok: false, error: "not_yet_due" };
      if (f.status === "ACCEPTED" && f.answerDeadlineAt) return t >= f.answerDeadlineAt.getTime() ? { ok: true, to: "EXPIRED" } : { ok: false, error: "not_yet_due" };
      return { ok: false, error: "invalid_state" };
  }
}

export interface RequestFacts {
  appointment: { status: string; patientId: string; doctorId: string; endsAt: Date };
  requesterId: string;
  target: { id: string; isListed: boolean; acceptsSecondOpinions: boolean } | null;
  openCountForPatient: number;
  countForAppointment: number;
  duplicateOpenToSameDoctor: boolean;
  recordCount: number;
}
export type SoRequestError =
  | "not_owner" | "appointment_not_completed" | "request_window_passed" | "target_unavailable" | "same_doctor"
  | "too_many_open" | "too_many_for_appointment" | "duplicate_request" | "too_many_records";
export type SoRequestPlan =
  | { ok: true; acceptDeadlineAt: Date; sharesExpireAt: Date }
  | { ok: false; error: SoRequestError };

export function planSoRequest(f: RequestFacts, now: Date, cfg: SoConfig = DEFAULT_SO_CONFIG): SoRequestPlan {
  const bad = (error: SoRequestError): SoRequestPlan => ({ ok: false, error });
  if (f.appointment.patientId !== f.requesterId) return bad("not_owner"); // وجود نوبت لو نرود ⇒ در سرویس 404
  if (f.appointment.status !== "COMPLETED") return bad("appointment_not_completed");
  if (now.getTime() > f.appointment.endsAt.getTime() + cfg.requestWindowDays * 24 * H) return bad("request_window_passed");
  if (!f.target || !f.target.isListed || !f.target.acceptsSecondOpinions || f.target.id === f.requesterId) return bad("target_unavailable");
  if (f.target.id === f.appointment.doctorId) return bad("same_doctor");
  if (f.duplicateOpenToSameDoctor) return bad("duplicate_request");
  if (f.countForAppointment >= cfg.maxPerAppointment) return bad("too_many_for_appointment");
  if (f.openCountForPatient >= cfg.maxOpenPerPatient) return bad("too_many_open");
  if (f.recordCount > cfg.maxSharedRecords) return bad("too_many_records");
  const accept = new Date(now.getTime() + cfg.acceptWithinHours * H);
  return { ok: true, acceptDeadlineAt: accept, sharesExpireAt: new Date(now.getTime() + (cfg.acceptWithinHours + cfg.answerWithinHours + cfg.shareExtraDays * 24) * H) };
}
