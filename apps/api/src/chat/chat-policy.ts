/** قواعد خالص چت (قابل تست بدون DB/MinIO). */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * کلید شیء پیوست چت باید دقیقاً همان قالبی باشد که StorageService برای «همین کاربر» می‌سازد:
 *   chat/<userId>/<uploadId>.<ext>
 * وگرنه فرستنده می‌توانست کلید شیء دیگران (یا records/…) را به پیام خودش وصل کند و لینک دانلود امضاشده بگیرد.
 */
export function isOwnChatObjectKey(userId: string, key: string): boolean {
  if (!new RegExp(`^${UUID}$`, "i").test(userId)) return false;
  return new RegExp(`^chat/${userId.toLowerCase()}/${UUID}\\.[a-z0-9]{1,10}$`).test(key.toLowerCase()) && !key.includes("..");
}

export interface VerifiedAttachment { mime: string; bytes: number }

/**
 * پیوست «سمت سرور» راستی‌آزمایی می‌شود: نوع و حجم از HEAD ی شیء می‌آید، نه از ادعای کلاینت.
 * mime باید در فهرست مجاز چت باشد و حجم از سقف نگذرد؛ ادعای کلاینت (اگر باشد) باید با واقعیت بخواند.
 */
export function verifyAttachment(
  head: { size: number; mime: string },
  claimed: { mime?: string; bytes?: number },
  allowedMime: readonly string[],
  maxBytes: number,
): { ok: true; value: VerifiedAttachment } | { ok: false; error: "mime_not_allowed" | "too_large" | "empty" | "mime_mismatch" | "size_mismatch" } {
  if (!allowedMime.includes(head.mime)) return { ok: false, error: "mime_not_allowed" };
  if (head.size <= 0) return { ok: false, error: "empty" };
  if (head.size > maxBytes) return { ok: false, error: "too_large" };
  if (claimed.mime !== undefined && claimed.mime !== head.mime) return { ok: false, error: "mime_mismatch" };
  if (claimed.bytes !== undefined && claimed.bytes !== head.size) return { ok: false, error: "size_mismatch" };
  return { ok: true, value: { mime: head.mime, bytes: head.size } };
}
