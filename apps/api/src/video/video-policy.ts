import type { Status } from "../scheduling/actions";

/**
 * سیاست ورود به ویزیت تصویری — تابع خالص (بدون I/O) تا کاملاً قابل‌تست باشد.
 *
 * قواعد:
 *  - فقط دو طرفِ همین نوبت (ادمین هم نه).
 *  - فقط kind=VIDEO و وضعیت CONFIRMED یا IN_PROGRESS.
 *  - پنجره: از (شروع − startEarlyMinutes) تا (پایان + joinGraceMinutes).
 *    startEarlyMinutes همان مقدار «شروع زودهنگام پزشک» در ماشین وضعیت است تا دو قاعده ناسازگار نشوند.
 */
export interface VisitFacts {
  status: Status;
  kind: "IN_PERSON" | "VIDEO" | "CHAT";
  startsAt: Date;
  endsAt: Date;
  doctorId: string;
  patientId: string;
}

export type JoinRole = "doctor" | "patient";
export type JoinError = "not_participant" | "not_video_visit" | "invalid_state" | "too_early" | "too_late";

export type JoinDecision =
  | { ok: true; role: JoinRole; opensAt: Date; closesAt: Date }
  | { ok: false; error: JoinError; opensAt?: Date; closesAt?: Date };

const MIN = 60_000;

export function joinWindow(
  v: Pick<VisitFacts, "startsAt" | "endsAt">,
  cfg: { startEarlyMinutes: number; joinGraceMinutes: number },
): { opensAt: Date; closesAt: Date } {
  return {
    opensAt: new Date(v.startsAt.getTime() - cfg.startEarlyMinutes * MIN),
    closesAt: new Date(v.endsAt.getTime() + cfg.joinGraceMinutes * MIN),
  };
}

export function planJoin(
  v: VisitFacts,
  userId: string,
  now: Date,
  cfg: { startEarlyMinutes: number; joinGraceMinutes: number },
): JoinDecision {
  const role: JoinRole | null = userId === v.doctorId ? "doctor" : userId === v.patientId ? "patient" : null;
  if (!role) return { ok: false, error: "not_participant" };
  if (v.kind !== "VIDEO") return { ok: false, error: "not_video_visit" };
  if (v.status !== "CONFIRMED" && v.status !== "IN_PROGRESS") return { ok: false, error: "invalid_state" };

  const w = joinWindow(v, cfg);
  const t = now.getTime();
  if (t < w.opensAt.getTime()) return { ok: false, error: "too_early", ...w };
  if (t >= w.closesAt.getTime()) return { ok: false, error: "too_late", ...w };
  return { ok: true, role, ...w };
}

/** هویت LiveKit: شناسه‌ی شبه‌ناشناس کاربر (بدون نام/موبایل). */
export const identityOf = (userId: string): string => `u_${userId}`;
export const userIdOf = (identity: string): string | null => (identity.startsWith("u_") ? identity.slice(2) : null);
