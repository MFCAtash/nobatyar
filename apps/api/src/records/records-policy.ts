/** سیاست‌های خالص پرونده‌ی سلامت. */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * کلید شیء پیوست باید دقیقاً همان کلیدی باشد که upload-token برای «همین کاربر» ساخته (records/<userId>/<uuid>.<ext>).
 * بدون این بررسی، بیمار می‌توانست کلید فایل دیگران را ثبت و با لینک دانلود برداشت کند.
 */
export function isOwnRecordObjectKey(userId: string, key: string): boolean {
  if (!new RegExp(`^${UUID}$`, "i").test(userId)) return false;
  return new RegExp(`^records/${userId}/${UUID}\\.[a-z0-9]{1,8}$`, "i").test(key);
}

export const SHARE_MAX_DAYS = 365;
/** انقضای اشتراک: اجباری برای ثبت امن؛ پیش‌فرض ۳۰ روز، حداکثر ۳۶۵ روز، باید آینده باشد. */
export function resolveShareExpiry(now: Date, requested?: Date, defaultDays = 30): { ok: true; expiresAt: Date } | { ok: false; error: "expiry_in_past" | "expiry_too_far" } {
  const exp = requested ?? new Date(now.getTime() + defaultDays * 86_400_000);
  if (exp.getTime() <= now.getTime()) return { ok: false, error: "expiry_in_past" };
  if (exp.getTime() > now.getTime() + SHARE_MAX_DAYS * 86_400_000) return { ok: false, error: "expiry_too_far" };
  return { ok: true, expiresAt: exp };
}
