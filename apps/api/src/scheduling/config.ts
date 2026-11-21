export const SCHEDULING_CONFIG = Symbol("SCHEDULING_CONFIG");

export interface SchedulingConfig {
  minLeadMinutes: number;          // حداقل فاصله تا شروع نوبت برای رزرو
  maxAdvanceDays: number;          // بیشترین بازه‌ی رزرو آینده
  holdMinutes: number;             // نگه‌داشتن اسلات تا پرداخت
  confirmDeadlineHours: number;    // مهلت تأیید پزشک از لحظه‌ی ثبت
  confirmBeforeStartMinutes: number; // اگر تا این‌قدر قبل از شروع تأیید نشد ⇒ منقضی
  maxOpenPerPatient: number;       // سقف نوبت‌های باز هر بیمار
  refundMidPercent: number;        // درصد بازپرداخت لغو بین ۲ تا ۲۴ ساعت قبل
  refundFullHours: number;         // لغو زودتر از این ⇒ ۱۰۰٪
  refundNoneHours: number;         // لغو دیرتر از این ⇒ ۰٪
  startEarlyMinutes: number;       // پزشک از چند دقیقه قبل می‌تواند شروع کند
  patientNoShowGraceMinutes: number;
  doctorNoShowReportMinutes: number;
}

const int = (v: string | undefined, d: number, name: string, min = 0, max = 1_000_000): number => {
  if (v === undefined || v === "") return d;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer in [${min}, ${max}]`);
  return n;
};

export function loadSchedulingConfig(env: NodeJS.ProcessEnv = process.env): SchedulingConfig {
  const cfg: SchedulingConfig = {
    minLeadMinutes: int(env.MIN_LEAD_MINUTES, 30, "MIN_LEAD_MINUTES"),
    maxAdvanceDays: int(env.MAX_ADVANCE_DAYS, 60, "MAX_ADVANCE_DAYS", 1, 365),
    holdMinutes: int(env.HOLD_MINUTES, 10, "HOLD_MINUTES", 1, 120),
    confirmDeadlineHours: int(env.CONFIRM_DEADLINE_HOURS, 24, "CONFIRM_DEADLINE_HOURS", 1, 168),
    confirmBeforeStartMinutes: int(env.CONFIRM_BEFORE_START_MINUTES, 120, "CONFIRM_BEFORE_START_MINUTES"),
    maxOpenPerPatient: int(env.MAX_OPEN_PER_PATIENT, 3, "MAX_OPEN_PER_PATIENT", 1, 50),
    refundMidPercent: int(env.REFUND_MID_PERCENT, 50, "REFUND_MID_PERCENT", 0, 100),
    refundFullHours: int(env.REFUND_FULL_HOURS, 24, "REFUND_FULL_HOURS", 1, 720),
    refundNoneHours: int(env.REFUND_NONE_HOURS, 2, "REFUND_NONE_HOURS", 0, 720),
    startEarlyMinutes: int(env.START_EARLY_MINUTES, 10, "START_EARLY_MINUTES", 0, 120),
    patientNoShowGraceMinutes: int(env.PATIENT_NO_SHOW_GRACE_MINUTES, 10, "PATIENT_NO_SHOW_GRACE_MINUTES", 0, 120),
    doctorNoShowReportMinutes: int(env.DOCTOR_NO_SHOW_REPORT_MINUTES, 15, "DOCTOR_NO_SHOW_REPORT_MINUTES", 0, 120),
  };
  if (cfg.refundNoneHours >= cfg.refundFullHours) throw new Error("REFUND_NONE_HOURS must be < REFUND_FULL_HOURS");
  return cfg;
}
