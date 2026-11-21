import type { AppointmentKind, AppointmentStatus } from "./types";

/**
 * پنجره‌ی ورود به ویزیت تصویری — فقط برای UX (فعال/غیرفعال‌کردن دکمه و شمارش معکوس).
 * قاعده‌ی نهایی با سرور است (apps/api/src/video/video-policy.ts)؛ اگر مقدارها فرق کنند سرور رد می‌کند.
 */
export const VIDEO_EARLY_MINUTES = 10;
export const VIDEO_GRACE_MINUTES = 15;

export type VideoUiState = "open" | "early" | "ended" | "unavailable" | "not_video";

export interface VideoUi { state: VideoUiState; opensAt: Date; closesAt: Date }

const MIN = 60_000;

export function videoUiState(
  a: { status: AppointmentStatus; kind: AppointmentKind; startsAt: string; endsAt: string },
  nowMs: number,
  cfg: { early: number; grace: number } = { early: VIDEO_EARLY_MINUTES, grace: VIDEO_GRACE_MINUTES },
): VideoUi {
  const opensAt = new Date(new Date(a.startsAt).getTime() - cfg.early * MIN);
  const closesAt = new Date(new Date(a.endsAt).getTime() + cfg.grace * MIN);
  let state: VideoUiState;
  if (a.kind !== "VIDEO") state = "not_video";
  else if (a.status !== "CONFIRMED" && a.status !== "IN_PROGRESS") state = "unavailable";
  else if (nowMs < opensAt.getTime()) state = "early";
  else if (nowMs >= closesAt.getTime()) state = "ended";
  else state = "open";
  return { state, opensAt, closesAt };
}

/** کیفیت اتصال LiveKit → برچسب فارسی و رنگ */
export function qualityLabel(q: string | undefined): { text: string; tone: "ok" | "warn" | "bad" | "muted" } {
  switch (q) {
    case "excellent": return { text: "اتصال عالی", tone: "ok" };
    case "good": return { text: "اتصال خوب", tone: "ok" };
    case "poor": return { text: "اتصال ضعیف", tone: "warn" };
    case "lost": return { text: "اتصال قطع", tone: "bad" };
    default: return { text: "—", tone: "muted" };
  }
}

/** پیام فارسی برای خطای دسترسی به دوربین/میکروفون (نام‌های خطای getUserMedia) */
export function mediaErrorMessage(name: string | undefined): string {
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "دسترسی به دوربین/میکروفون داده نشد. از آیکن قفل کنار آدرس مرورگر اجازه بدهید و دوباره امتحان کنید.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "دوربین یا میکروفون پیدا نشد. اتصال دستگاه را بررسی کنید.";
    case "NotReadableError":
    case "AbortError":
      return "دوربین/میکروفون در برنامه‌ی دیگری در حال استفاده است. آن برنامه را ببندید.";
    default:
      return "راه‌اندازی دوربین/میکروفون ممکن نشد.";
  }
}
