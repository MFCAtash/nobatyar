import type { Action } from "./actions";

/** جدول قواعد بازپرداخت — جایگزینی magic numberها با قواعد نامدار و قابل نمایش. */
export interface RefundRule {
  id: string;
  labelFa: string;
  action: Action;
  /** بازهٔ ساعت قبل از شروع نوبت؛ قواعد به ترتیب اولویت اعمال میشوند. */
  hoursBeforeMin?: number;
  hoursBeforeMax?: number;
  percent: number;
}

export type RefundPolicyConfig = {
  refundFullHours: number;
  refundNoneHours: number;
  refundMidPercent: number;
};

export function refundRules(cfg: RefundPolicyConfig): RefundRule[] {
  return [
    { id: "doctor_cancel_full", labelFa: "لغو توسط پزشک — بازپرداخت کامل", action: "DOCTOR_CANCEL", percent: 100 },
    { id: "doctor_no_show_full", labelFa: "عدم حضور پزشک — بازپرداخت کامل", action: "REPORT_DOCTOR_NO_SHOW", percent: 100 },
    { id: "expired_full", labelFa: "انقضای نوبت — بازپرداخت کامل", action: "EXPIRE", percent: 100 },
    { id: "patient_early_full", labelFa: "لغو بیمار زودتر از آستانه — ۱۰۰٪", action: "PATIENT_CANCEL", hoursBeforeMin: cfg.refundFullHours, percent: 100 },
    { id: "patient_mid", labelFa: "لغو بیمار در بازهٔ میانی", action: "PATIENT_CANCEL", hoursBeforeMin: cfg.refundNoneHours, hoursBeforeMax: cfg.refundFullHours, percent: cfg.refundMidPercent },
    { id: "patient_late_none", labelFa: "لغو بیمار نزدیک به نوبت — بدون بازپرداخت", action: "PATIENT_CANCEL", hoursBeforeMax: cfg.refundNoneHours, percent: 0 },
    { id: "patient_no_show_none", labelFa: "عدم حضور بیمار — بدون بازپرداخت", action: "REPORT_PATIENT_NO_SHOW", percent: 0 },
  ];
}

/** قانون منطبق را بر اساس اقدام و فاصلهٔ زمانی تا شروع نوبت برمیگرداند. */
export function selectRefundRule(action: Action, hoursBefore: number, cfg: RefundPolicyConfig): RefundRule {
  const rule = refundRules(cfg).find((r) => {
    if (r.action !== action) return false;
    if (r.hoursBeforeMin !== undefined && hoursBefore < r.hoursBeforeMin) return false;
    if (r.hoursBeforeMax !== undefined && hoursBefore >= r.hoursBeforeMax) return false;
    return true;
  });
  return rule ?? { id: "none", labelFa: "بدون بازپرداخت", action, percent: 0 };
}
