/**
 * رجیستری قواعد ماشین وضعیت نوبت (M2) — policy-as-code، خالص و قابل شبیهسازی.
 * منبع رفتار: apps/api/src/scheduling/actions.ts (planAction / computeRefund).
 * این ماژول جایگزین planAction نمیشود؛ نسخهٔ قابل نمایش و شبیهسازی همان قواعد است.
 */
import { APPOINTMENT_STATUSES, type AppointmentStatus } from "./appointment";

export type AppointmentAction =
  | "CONFIRM" | "DOCTOR_CANCEL" | "PATIENT_CANCEL" | "START" | "COMPLETE"
  | "REPORT_PATIENT_NO_SHOW" | "REPORT_DOCTOR_NO_SHOW" | "EXPIRE" | "PAYMENT_SUCCEEDED";

export type PolicyActor = "doctor" | "patient" | "system";
export type GuardKind = "before_start" | "start_window" | "after_start_grace" | "any" | "auto_confirm";
export type Compensation = "refund_full" | "refund_by_policy" | "none";

export interface TransitionRule {
  id: string;
  from: readonly AppointmentStatus[];
  action: AppointmentAction;
  actor: PolicyActor;
  guard: GuardKind;
  /** وضعیت مقصد پویا است (مثلاً پرداخت با autoConfirm). */
  to?: AppointmentStatus;
  compensation: Compensation;
  slaMinutes?: number;
  labelFa: string;
}

export interface PolicyVersion {
  version: number;
  aggregate: "APPOINTMENT";
  rules: readonly TransitionRule[];
}

export const TRANSITION_POLICY_VERSION = 1;

export const TRANSITION_RULES: readonly TransitionRule[] = [
  { id: "v1:CONFIRM", from: ["PENDING_CONFIRMATION"], action: "CONFIRM", actor: "doctor", guard: "before_start", to: "CONFIRMED", compensation: "none", slaMinutes: 24 * 60, labelFa: "تأیید نوبت توسط پزشک" },
  { id: "v1:DOCTOR_CANCEL", from: ["PENDING_CONFIRMATION", "CONFIRMED"], action: "DOCTOR_CANCEL", actor: "doctor", guard: "before_start", to: "CANCELLED_BY_DOCTOR", compensation: "refund_full", labelFa: "لغو توسط پزشک — بازپرداخت کامل" },
  { id: "v1:PATIENT_CANCEL", from: ["PENDING_PAYMENT", "PENDING_CONFIRMATION", "CONFIRMED"], action: "PATIENT_CANCEL", actor: "patient", guard: "before_start", to: "CANCELLED_BY_PATIENT", compensation: "refund_by_policy", labelFa: "لغو توسط بیمار — بازپرداخت بر اساس جدول" },
  { id: "v1:START", from: ["CONFIRMED"], action: "START", actor: "doctor", guard: "start_window", to: "IN_PROGRESS", compensation: "none", labelFa: "آغاز ویزیت" },
  { id: "v1:COMPLETE", from: ["IN_PROGRESS"], action: "COMPLETE", actor: "doctor", guard: "any", to: "COMPLETED", compensation: "none", labelFa: "اتمام ویزیت" },
  { id: "v1:REPORT_PATIENT_NO_SHOW", from: ["CONFIRMED"], action: "REPORT_PATIENT_NO_SHOW", actor: "doctor", guard: "after_start_grace", to: "NO_SHOW_PATIENT", compensation: "none", labelFa: "عدم حضور بیمار" },
  { id: "v1:REPORT_DOCTOR_NO_SHOW", from: ["CONFIRMED"], action: "REPORT_DOCTOR_NO_SHOW", actor: "patient", guard: "after_start_grace", to: "NO_SHOW_DOCTOR", compensation: "refund_full", labelFa: "عدم حضور پزشک — بازپرداخت کامل" },
  { id: "v1:EXPIRE", from: ["PENDING_PAYMENT", "PENDING_CONFIRMATION"], action: "EXPIRE", actor: "system", guard: "any", to: "EXPIRED", compensation: "refund_full", slaMinutes: 10, labelFa: "انقضای نگه داشتن اسلات" },
  { id: "v1:PAYMENT_SUCCEEDED", from: ["PENDING_PAYMENT"], action: "PAYMENT_SUCCEEDED", actor: "system", guard: "auto_confirm", compensation: "none", labelFa: "پرداخت موفق" },
];

export const APPOINTMENT_POLICY: PolicyVersion = {
  version: TRANSITION_POLICY_VERSION,
  aggregate: "APPOINTMENT",
  rules: TRANSITION_RULES,
};

export interface PolicyFacts {
  status: AppointmentStatus;
  startsAt: Date;
  endsAt: Date;
  autoConfirm: boolean;
  paidRial?: bigint;
}

/** زیرمجموعهٔ SchedulingConfig که شبیهساز به آن نیاز دارد. */
export interface PolicyTimingConfig {
  startEarlyMinutes: number;
  patientNoShowGraceMinutes: number;
  doctorNoShowReportMinutes: number;
  refundFullHours: number;
  refundNoneHours: number;
  refundMidPercent: number;
}

export type PolicyPlanError = "invalid_state" | "too_late" | "too_early";
export type PolicyPlan = { ok: true; to: AppointmentStatus; ruleId: string } | { ok: false; error: PolicyPlanError; ruleId?: string };

const MIN = 60_000;

/** شبیهسازی دقیق planAction — بدون دسترسی به DB یا PHI. */
export function evaluateTransition(
  policy: PolicyVersion,
  action: AppointmentAction,
  facts: PolicyFacts,
  now: Date,
  cfg: PolicyTimingConfig,
): PolicyPlan {
  const rule = policy.rules.find((r) => r.action === action);
  if (!rule || !rule.from.includes(facts.status)) return { ok: false, error: "invalid_state", ruleId: rule?.id };
  const t = now.getTime();
  if (rule.guard === "before_start" && t >= facts.startsAt.getTime()) return { ok: false, error: "too_late", ruleId: rule.id };
  if (rule.guard === "start_window") {
    if (t < facts.startsAt.getTime() - cfg.startEarlyMinutes * MIN) return { ok: false, error: "too_early", ruleId: rule.id };
    if (t >= facts.endsAt.getTime()) return { ok: false, error: "too_late", ruleId: rule.id };
  }
  if (rule.guard === "after_start_grace") {
    const grace = action === "REPORT_PATIENT_NO_SHOW" ? cfg.patientNoShowGraceMinutes : cfg.doctorNoShowReportMinutes;
    if (t < facts.startsAt.getTime() + grace * MIN) return { ok: false, error: "too_early", ruleId: rule.id };
  }
  const to: AppointmentStatus = rule.action === "PAYMENT_SUCCEEDED"
    ? (facts.autoConfirm ? "CONFIRMED" : "PENDING_CONFIRMATION")
    : rule.to ?? facts.status;
  return { ok: true, to, ruleId: rule.id };
}

/** بازپرداخت تخمینی برای شبیهساز (همان فرمول computeRefund). */
export function simulateRefund(
  action: AppointmentAction,
  paidRial: bigint,
  startsAt: Date,
  now: Date,
  cfg: PolicyTimingConfig,
): { percent: number; amountRial: bigint } {
  let percent = 0;
  if (action === "DOCTOR_CANCEL" || action === "REPORT_DOCTOR_NO_SHOW" || action === "EXPIRE") percent = 100;
  else if (action === "PATIENT_CANCEL") {
    const hoursBefore = (startsAt.getTime() - now.getTime()) / 3_600_000;
    percent = hoursBefore >= cfg.refundFullHours ? 100 : hoursBefore >= cfg.refundNoneHours ? cfg.refundMidPercent : 0;
  }
  return { percent, amountRial: (paidRial * BigInt(percent)) / 100n };
}

/** نمودار stateDiagram-v2 برای نمایش زنده در ادمین. */
export function toMermaid(policy: PolicyVersion): string {
  const lines = ["stateDiagram-v2"];
  for (const s of APPOINTMENT_STATUSES) lines.push(`  ${s}`);
  for (const r of policy.rules) {
    for (const from of r.from) {
      const to = r.to ?? (r.action === "PAYMENT_SUCCEEDED" ? "PENDING_CONFIRMATION" : from);
      lines.push(`  ${from} --> ${to}: ${r.action} (${r.actor})`);
    }
  }
  return lines.join("\n");
}

/** قواعد سلامت policy: هر یال معتبر است و هر انتقال غیرپایانی جبران دارد. */
export function assertPolicyInvariants(policy: PolicyVersion): string[] {
  const problems: string[] = [];
  const valid = new Set<string>(APPOINTMENT_STATUSES);
  for (const r of policy.rules) {
    if (r.from.some((s) => !valid.has(s))) problems.push(`${r.id}: وضعیت مبدا نامعتبر`);
    if (r.to && !valid.has(r.to)) problems.push(`${r.id}: وضعیت مقصد نامعتبر`);
    if (r.compensation === "none" && r.id.includes("CANCEL")) problems.push(`${r.id}: لغو بدون جبران`);
    if (new Set(policy.rules.map((x) => x.id)).size !== policy.rules.length) problems.push("شناسهٔ قواعد تکراری است");
  }
  return problems;
}
