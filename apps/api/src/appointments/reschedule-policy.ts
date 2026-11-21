import type { Status } from "../scheduling/actions";
import type { SchedulingConfig } from "../scheduling/config";

export type RescheduleError = "invalid_state" | "too_late" | "too_early" | "unchanged";

export type ReschedulePlan = { ok: true } | { ok: false; error: RescheduleError };

/**
 * جابهجایی اتمی: بدون لغو، بدون بازپرداخت و بدون پرداخت مجدد.
 * فقط نوبتهای «تأییدشده/منتظر تأیید» و حداقل minLeadMinutes قبل از شروع قابل جابهجاییاند.
 * predicative pure ⇒ قابل تست بدون دیتابیس.
 */
export function planReschedule(
  current: { status: Status; startsAt: Date; endsAt: Date },
  target: Date,
  now: Date,
  cfg: Pick<SchedulingConfig, "minLeadMinutes">,
): ReschedulePlan {
  if (current.status !== "CONFIRMED" && current.status !== "PENDING_CONFIRMATION") return { ok: false, error: "invalid_state" };
  if (target.getTime() === current.startsAt.getTime()) return { ok: false, error: "unchanged" };
  if (now.getTime() >= current.startsAt.getTime()) return { ok: false, error: "too_late" };
  if (target.getTime() <= now.getTime() + cfg.minLeadMinutes * 60_000) return { ok: false, error: "too_early" };
  return { ok: true };
}

/** نیازمندیهای مجوز جابهجایی: طرفین نوبت (نه ادمین و نه پزشک دیگر). */
export function canActorReschedule(actorId: string, patientId: string, doctorId: string): boolean {
  return actorId === patientId || actorId === doctorId;
}
