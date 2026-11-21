import { createHash } from "node:crypto";

/**
 * Outbox: رویداد «در همان تراکنشِ تغییر وضعیت» نوشته می‌شود؛ یک relay جداگانه آن را «حداقل یک‌بار» تحویل می‌دهد.
 * نتیجه: یا هم وضعیت و هم رویداد ثبت شده‌اند، یا هیچ‌کدام ⇒ اعلان و وضعیت هرگز ناسازگار نمی‌شوند
 * (پیش‌تر: commit ⇒ مرگ پروسه ⇒ اعلان برای همیشه گم می‌شد).
 */
export const MAX_ATTEMPTS = 8;
export const LEASE_MS = 60_000;
export const BATCH_SIZE = 20;
export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_MAX_MS = 15 * 60_000;
export const PROCESSED_RETENTION_MS = 7 * 24 * 3_600_000;

/** تأخیر پیش از تلاش بعدی (attempts = تعداد تلاش‌های انجام‌شده، ≥۱): ۵ث، ۱۰ث، ۲۰ث … سقف ۱۵ دقیقه */
export const backoffMs = (attempts: number): number => Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1), BACKOFF_MAX_MS);

export type FailureDecision = { status: "PENDING"; availableAt: Date } | { status: "DEAD" };

export function decideFailure(attempts: number, now: Date, max: number = MAX_ATTEMPTS): FailureDecision {
  if (attempts >= max) return { status: "DEAD" };
  return { status: "PENDING", availableAt: new Date(now.getTime() + backoffMs(attempts)) };
}

/**
 * شناسه‌ی UUID قطعی از یک کلید: تحویل «حداقل یک‌بار» ⇒ تحویل دوباره‌ی همان رویداد نباید اعلان تکراری بسازد.
 * (کلید = «شناسه‌ی رویداد:گیرنده»؛ INSERT با همین id دوباره‌کاری را بی‌اثر می‌کند.)
 */
export function uuidFromKey(key: string): string {
  const h = createHash("sha256").update(key).digest("hex");
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const truncateError = (e: unknown): string => String(e instanceof Error ? `${e.name}: ${e.message}` : e).slice(0, 500);
