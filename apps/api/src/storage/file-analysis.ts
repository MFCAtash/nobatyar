/**
 * M6 — تحلیل خالص بایت‌ها (Pure byte analysis).
 *
 * این ماژول完全是 خالص است: نه I/O دارد، نه به Nest وابسته است و نه به ساعت/تصادف.
 * تمام توابع آن قطعی (deterministic) هستند تا تست‌ها قابل تکرار باشند.
 * هیچ رشته‌ای را لاگ نمی کند و نام فایلی دریافت نمی کند — فقط بایت و آفست.
 */

export type BytesLike = Uint8Array | readonly number[];

/** رشته‌ی ASCII/Latin-1 را به بایت تبدیل می کند (بدون Buffer و بدون وابستگی). */
function asciiBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

/** تا folding حروف A-Z فقط (برای جستجوی case-insensitive بدون تغییر طول رشته). */
function foldAscii(b: number): number {
  return b >= 0x41 && b <= 0x5a ? b + 0x20 : b;
}

/** آیا بایت‌ها از آفست مشخصی با الگوی داده‌شده شروع می شوند؟ */
export function startsWith(bytes: Uint8Array, prefix: BytesLike | string, offset = 0): boolean {
  const p = typeof prefix === "string" ? asciiBytes(prefix) : (prefix instanceof Uint8Array ? prefix : Uint8Array.from(prefix));
  if (!Number.isInteger(offset) || offset < 0 || offset + p.length > bytes.length) return false;
  for (let i = 0; i < p.length; i++) if (bytes[offset + i] !== p[i]) return false;
  return true;
}

/** جستجوی زیررشته‌ی ASCII در بایت‌ها (اختیاری: بدون حساسیت به حروف کوچک/بزرگ). */
export function containsAscii(bytes: Uint8Array, needle: string, caseInsensitive = false): boolean {
  if (!needle.length) return false;
  const pattern = asciiBytes(needle);
  if (caseInsensitive) for (let i = 0; i < pattern.length; i++) pattern[i] = foldAscii(pattern[i]);
  if (pattern.length > bytes.length) return false;
  for (let i = 0; i + pattern.length <= bytes.length; i++) {
    let hit = true;
    for (let j = 0; j < pattern.length; j++) {
      const b = caseInsensitive ? foldAscii(bytes[i + j]) : bytes[i + j];
      if (b !== pattern[j]) { hit = false; break; }
    }
    if (hit) return true;
  }
  return false;
}

/** نمایش Latin-1 از پنجره‌ی مشخص بایت‌ها (برای الگوهای متنی مانند <svg). */
export function latin1(bytes: Uint8Array, start = 0, end = bytes.length): string {
  const from = Math.max(0, start);
  const to = Math.min(bytes.length, end);
  let out = "";
  for (let i = from; i < to; i++) out += String.fromCharCode(bytes[i] & 0xff);
  return out;
}

/** UTF-8 معتبر؟ (بدون توالی ناقص/غیرقانونی) */
export function isUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * محتویات «متن ساده‌ی بی خطر»؟ متن باید UTF-8 معتبر باشد، نول نداشته باشد،
 * کنترل کاراکترهای خطرناک نداشته باشد و حاوی محتوای فعال (HTML/SVG/script) نباشد.
 * دلیل: SVG/HTML جزء لیست مجاز نیستند و اگر به عنوان text/plain پذیرفته شوند ⇒ XSS.
 */
export function isSafePlainText(bytes: Uint8Array, headBytes = 4096): boolean {
  if (bytes.length === 0) return false;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x00) return false;
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d && b !== 0x0c) return false;
    if (b === 0x7f) return false;
  }
  if (!isUtf8(bytes)) return false;
  return !looksLikeActiveText(bytes, headBytes);
}

/** الگوهای محتوای فعال که نباید به عنوان متن ساده پذیرفته شوند. */
export function looksLikeActiveText(bytes: Uint8Array, headBytes = 4096): boolean {
  const head = latin1(bytes, 0, Math.min(bytes.length, headBytes));
  const markers = [
    "<script", "<svg", "<html", "<!doctype", "<iframe", "<object",
    "<embed", "<form", "<style", "javascript:", "onerror=", "onload=",
    "<?xml", "<![cdata[",
  ];
  const lower = head.toLowerCase();
  return markers.some((m) => lower.includes(m));
}

/** وجود ورودی مشخص در آرشیو ZIP (مثلاً word/ یا [Content_Types].xml). */
export function hasZipEntry(bytes: Uint8Array, entryName: string): boolean {
  return containsAscii(bytes, entryName);
}

/** وجود نشاننده‌ی پایان PDF در انتهای فایل (کاهش polyglot/signature forge ساده). */
export function hasPdfEof(bytes: Uint8Array, windowBytes = 4096): boolean {
  if (bytes.length === 0) return false;
  const tail = latin1(bytes, Math.max(0, bytes.length - windowBytes));
  return tail.includes("%%EOF");
}
