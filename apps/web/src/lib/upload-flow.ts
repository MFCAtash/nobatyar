/**
 * M6 — بررسی سمت کاربر قبل از آپلود فایل.
 * تصمیم نهایی امنیتی (تشخیص جادو بایت، اسکن و قرنطینه) با سرور است؛
 * این ماژول فقط از ارسال بیهودهٔ فایل نامعتبر جلوگیری میکند و خالص است.
 */

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const ALLOWED_MIME: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "image/tiff",
  "application/dicom",
  DOCX,
  XLSX,
]);

export type UploadFileInput = { name: string; type: string; size: number };
export type UploadValidation = { ok: true; mime: string } | { ok: false; error: string };

/** حذف پارامترهایی مانند `;charset=utf-8` و کوچک کردن (همان normalizeMime سمت سرور). */
export function normalizeMime(mime: string): string {
  return mime.toLowerCase().split(";")[0].trim();
}

export function validateUploadInput(file: UploadFileInput): UploadValidation {
  const mime = normalizeMime(file.type);
  if (!ALLOWED_MIME.has(mime)) {
    return { ok: false, error: "نوع فایل مجاز نیست. فقط تصویر، PDF، DICOM، Word و اکسل پذیرفته میشود." };
  }
  if (!Number.isFinite(file.size) || file.size < 0) {
    return { ok: false, error: "اندازهٔ فایل نامعتبر است." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "حجم فایل نباید بیش از ۲۰ مگابایت باشد." };
  }
  return { ok: true, mime };
}

/** مراحل آپلود به ترتیب اجرا. */
export function uploadSteps(): string[] {
  return ["token", "put", "finalize"];
}

/** پسوند فایل: کوچک، بدون نقطه/مسیر و حداکثر ۸ نویسه. */
export function extractExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot < 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase().replace(/[.\\/]/g, "").slice(0, 8);
}
