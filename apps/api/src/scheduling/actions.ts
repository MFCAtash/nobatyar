import type { SchedulingConfig } from "./config";
import { selectRefundRule } from "./refund-policy";

/** وضعیت‌های نوبت (هم‌خوان با enum دیتابیس و packages/shared). */
export type Status =
  | "PENDING_PAYMENT" | "PENDING_CONFIRMATION" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED"
  | "CANCELLED_BY_PATIENT" | "CANCELLED_BY_DOCTOR" | "EXPIRED" | "NO_SHOW_PATIENT" | "NO_SHOW_DOCTOR";

export type Action =
  | "CONFIRM" | "DOCTOR_CANCEL" | "PATIENT_CANCEL" | "START" | "COMPLETE"
  | "REPORT_PATIENT_NO_SHOW" | "REPORT_DOCTOR_NO_SHOW" | "EXPIRE" | "PAYMENT_SUCCEEDED";

/** چه کسی مجاز به هر اقدام است */
export const ACTION_ACTOR: Record<Action, "doctor" | "patient" | "system"> = {
  CONFIRM: "doctor",
  DOCTOR_CANCEL: "doctor",
  START: "doctor",
  COMPLETE: "doctor",
  REPORT_PATIENT_NO_SHOW: "doctor",
  PATIENT_CANCEL: "patient",
  REPORT_DOCTOR_NO_SHOW: "patient",
  EXPIRE: "system",
  PAYMENT_SUCCEEDED: "system",
};

export interface AppointmentFacts {
  status: Status;
  startsAt: Date;
  endsAt: Date;
  autoConfirm: boolean;
}

export type PlanError = "invalid_state" | "too_late" | "too_early";
export type Plan = { ok: true; to: Status } | { ok: false; error: PlanError };

const MIN = 60_000;
const ok = (to: Status): Plan => ({ ok: true, to });
const bad = (error: PlanError): Plan => ({ ok: false, error });

/** ماشین وضعیت: با توجه به وضعیت فعلی و زمان، وضعیت بعدی یا خطا. (مجوز «چه کسی» جدا بررسی می‌شود.) */
export function planAction(action: Action, a: AppointmentFacts, now: Date, cfg: SchedulingConfig): Plan {
  const t = now.getTime();
  const from = a.status;
  switch (action) {
    case "CONFIRM":
      if (from !== "PENDING_CONFIRMATION") return bad("invalid_state");
      if (t >= a.startsAt.getTime()) return bad("too_late");
      return ok("CONFIRMED");

    case "DOCTOR_CANCEL":
      if (from !== "PENDING_CONFIRMATION" && from !== "CONFIRMED") return bad("invalid_state");
      if (t >= a.startsAt.getTime()) return bad("too_late");
      return ok("CANCELLED_BY_DOCTOR");

    case "PATIENT_CANCEL":
      if (from !== "PENDING_PAYMENT" && from !== "PENDING_CONFIRMATION" && from !== "CONFIRMED") return bad("invalid_state");
      if (t >= a.startsAt.getTime()) return bad("too_late");
      return ok("CANCELLED_BY_PATIENT");

    case "START":
      if (from !== "CONFIRMED") return bad("invalid_state");
      if (t < a.startsAt.getTime() - cfg.startEarlyMinutes * MIN) return bad("too_early");
      if (t >= a.endsAt.getTime()) return bad("too_late");
      return ok("IN_PROGRESS");

    case "COMPLETE":
      if (from !== "IN_PROGRESS") return bad("invalid_state");
      return ok("COMPLETED");

    case "REPORT_PATIENT_NO_SHOW":
      if (from !== "CONFIRMED") return bad("invalid_state");
      if (t < a.startsAt.getTime() + cfg.patientNoShowGraceMinutes * MIN) return bad("too_early");
      return ok("NO_SHOW_PATIENT");

    case "REPORT_DOCTOR_NO_SHOW":
      if (from !== "CONFIRMED") return bad("invalid_state");
      if (t < a.startsAt.getTime() + cfg.doctorNoShowReportMinutes * MIN) return bad("too_early");
      return ok("NO_SHOW_DOCTOR");

    case "EXPIRE":
      if (from !== "PENDING_PAYMENT" && from !== "PENDING_CONFIRMATION") return bad("invalid_state");
      return ok("EXPIRED");

    case "PAYMENT_SUCCEEDED":
      if (from !== "PENDING_PAYMENT") return bad("invalid_state");
      return ok(a.autoConfirm ? "CONFIRMED" : "PENDING_CONFIRMATION");
  }
}

export interface RefundDecision {
  percent: number;
  amountRial: bigint;
}

/** سیاست بازپرداخت برای نوبتِ پرداخت‌شده (docs/appointment-rules.md). */
export function computeRefund(action: Action, paidRial: bigint, startsAt: Date, now: Date, cfg: SchedulingConfig): RefundDecision {
  const hoursBefore = (startsAt.getTime() - now.getTime()) / 3_600_000;
  const percent = selectRefundRule(action, hoursBefore, cfg).percent;
  return { percent, amountRial: (paidRial * BigInt(percent)) / 100n };
}
