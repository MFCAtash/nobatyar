/**
 * M6 — امنیت فایل: تشخیص نوع بر اساس جادو بایت (نه MIME ادعایی کلاینت)،
 * تصمیم پذیرش/قرنطینه، ماشین وضعیت قرنطینه و لاگ‌های عاری از PHI.
 *
 * هیچ وابستگی به Nest/DB/MinIO ندارد تا به صورت قطعی و جداگانه تست شود.
 * لایه‌ی یکپارچهمسازی (storage.service/controller — توسط تیم مرکزی) مسئول فراخوانی
 * assertServable قبل از صدور لینک دانلود و تبدیل FileSecurityError به HTTP exception است.
 */

import { createRequire } from "node:module";
import { containsAscii, hasPdfEof, hasZipEntry, isSafePlainText, latin1, startsWith } from "./file-analysis";

/** سقف حجم (همان ۲۰ مگابایت storage.service؛ در صورت تغییر، اینجا هم بهروزرسانی شود). */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export type FileBucket = "chat" | "records";

/** لیست مجاز مطابق ALLOWED_MIME در storage.service.ts (کپی محلی برای حفظ خالص بودن ماژول). */
export const SECURE_ALLOWED_MIME: Readonly<Record<FileBucket, readonly string[]>> = {
  chat: [
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/pdf", "text/plain", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  records: [
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "image/dicom", "image/tiff",
    "application/pdf", "text/plain", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
};

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// ---------------------------------------------------------------------------
// تشخیص جادو بایت
// ---------------------------------------------------------------------------

export interface SniffResult {
  /** MIME تشخیصدادهشده؛ برای ناشناخته application/octet-stream است (⇒ رد میشود). */
  mime: string;
  /** شناسه‌ی قانون (غیر PHI) برای لاگ و عیبیابی. */
  rule: string;
}

interface MagicRule {
  id: string;
  mime: string;
  test: (b: Uint8Array) => boolean;
}

const isZip = (b: Uint8Array): boolean => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06]);
const isCfb = (b: Uint8Array): boolean => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

const MAGIC_RULES: readonly MagicRule[] = [
  { id: "pdf", mime: "application/pdf", test: (b) => startsWith(b, "%PDF-") && hasPdfEof(b) },
  { id: "png", mime: "image/png", test: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { id: "jpeg", mime: "image/jpeg", test: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  { id: "gif", mime: "image/gif", test: (b) => startsWith(b, "GIF87a") || startsWith(b, "GIF89a") },
  { id: "webp", mime: "image/webp", test: (b) => startsWith(b, "RIFF") && startsWith(b, "WEBP", 8) },
  { id: "tiff", mime: "image/tiff", test: (b) => startsWith(b, [0x49, 0x49, 0x2a, 0x00]) || startsWith(b, [0x4d, 0x4d, 0x00, 0x2a]) },
  { id: "dicom", mime: "image/dicom", test: (b) => b.length >= 132 && startsWith(b, "DICM", 128) },
  { id: "docx", mime: DOCX, test: (b) => isZip(b) && hasZipEntry(b, "[Content_Types].xml") && hasZipEntry(b, "word/") },
  { id: "xlsx", mime: XLSX, test: (b) => isZip(b) && hasZipEntry(b, "[Content_Types].xml") && hasZipEntry(b, "xl/") },
  { id: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", test: (b) => isZip(b) && hasZipEntry(b, "ppt/") },
  { id: "doc", mime: "application/msword", test: (b) => isCfb(b) && containsAscii(b, "WordDocument") },
  { id: "svg", mime: "image/svg+xml", test: (b) => /<\s*svg[\s/>]/i.test(latin1(b, 0, Math.min(b.length, 4096))) },
  { id: "html", mime: "text/html", test: (b) => /<!doctype\s+html|<html[\s>]/i.test(latin1(b, 0, Math.min(b.length, 4096))) },
  { id: "text", mime: "text/plain", test: (b) => isSafePlainText(b) },
];

/** تشخیص نوع واقعی فایل صرفاً از بایت‌ها (مرجع: جدول بالا). */
export function sniffMagicBytes(bytes: Uint8Array): SniffResult {
  for (const rule of MAGIC_RULES) {
    if (rule.test(bytes)) return { mime: rule.mime, rule: rule.id };
  }
  return { mime: "application/octet-stream", rule: "unknown" };
}

/** نرمالسازی MIME ادعایی: حذف پارامترها مانند ;charset=utf-8 و کوچک کردن. */
export function normalizeMime(mime: string): string {
  return mime.split(";")[0].trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// تصمیم امنیتی
// ---------------------------------------------------------------------------

export type DecisionCode =
  | "OK"
  | "EMPTY"
  | "TOO_LARGE"
  | "ACTIVE_CONTENT"
  | "MIME_NOT_ALLOWED"
  | "MIME_MISMATCH";

export interface AnalyzeInput {
  /** پیشوند محدود شیء (مثلاً ۶۴ کیلوبایت اول) برای تشخیص جادو بایت. */
  bytes: Uint8Array;
  /** اندازه‌ی واقعی شیء از HEAD — اگر داده نشود برابر bytes.length فرض میشود. */
  size?: number;
  bucket: FileBucket;
  /** صرفاً بهعنوان بررسی سازگاری؛ NEVER مبنای پذیرش نیست. */
  declaredMime?: string;
  maxBytes?: number;
}

export interface SecurityDecision {
  ok: boolean;
  code: DecisionCode;
  detectedMime: string;
  /** شناسه قانون جادو بایت (غیر PHI) */
  rule: string;
  bucket: FileBucket;
  size: number;
}

const ACTIVE_MIMES = new Set(["image/svg+xml", "text/html"]);

/**
 * تصمیم پذیرش. ترتیب: خالی → حجم → جادو بایت → لیست مجاز → تطابق ادعای کلاینت.
 * MIME کلاینت بههیچوجه نمیتواند فایلی را «مجاز» کند؛ فقط میتواند باعث رد شود.
 */
export function analyzeFile(input: AnalyzeInput): SecurityDecision {
  const { bytes, bucket } = input;
  const rawSize = input.size ?? bytes.length;
  // اندازه‌ی نامعتبر ⇒ صفر ⇒ رد (fail-closed)
  const size = Number.isInteger(rawSize) && rawSize >= 0 ? rawSize : 0;
  const maxBytes = input.maxBytes ?? MAX_FILE_BYTES;
  const sniff = sniffMagicBytes(bytes);
  const base = { detectedMime: sniff.mime, rule: sniff.rule, bucket, size };

  if (size === 0) return { ok: false, code: "EMPTY", ...base };
  if (size > maxBytes) return { ok: false, code: "TOO_LARGE", ...base };
  if (ACTIVE_MIMES.has(sniff.mime)) return { ok: false, code: "ACTIVE_CONTENT", ...base };
  if (!(SECURE_ALLOWED_MIME[bucket] ?? []).includes(sniff.mime)) return { ok: false, code: "MIME_NOT_ALLOWED", ...base };
  if (input.declaredMime !== undefined && normalizeMime(input.declaredMime) !== sniff.mime) {
    return { ok: false, code: "MIME_MISMATCH", ...base };
  }
  return { ok: true, code: "OK", ...base };
}

// ---------------------------------------------------------------------------
//cross-check اختیاری با بسته‌ی file-type (در صورت availability)
// ---------------------------------------------------------------------------

/**
 * file-type@20 بهعنوان وابستگی اختیاری transient در @nestjs/common نصب شده و در
 * package.json اعلام نشده است ⇒ مسیر اصلی تشخیص، جدول جادو بایت بالاست.
 * این adapter صرفاً یک بررسی دوم غیرمسدودکننده است؛ با تزریق loader در تست قطعی میشود.
 */
export type ExternalSniffer = (bytes: Uint8Array) => Promise<{ mime: string | null }>;
export type SnifferLoader = () => ExternalSniffer | null;

export const defaultFileTypeLoader: SnifferLoader = () => {
  try {
    // require پویا و محافظت شده: نبود بسته ⇒ null ⇒ ادامه با جدول داخلی (fail-safe).
    const base = typeof __filename === "string" ? __filename : `${process.cwd()}/index.js`;
    const req = createRequire(base);
    const mod = req("file-type") as { fileTypeFromBuffer?: (b: Uint8Array) => Promise<{ mime: string } | undefined> } | undefined;
    if (typeof mod?.fileTypeFromBuffer !== "function") return null;
    const fn = mod.fileTypeFromBuffer;
    return async (bytes) => {
      try {
        const r = await fn(bytes);
        return { mime: r?.mime ? normalizeMime(r.mime) : null };
      } catch {
        return { mime: null };
      }
    };
  } catch {
    return null;
  }
};

const GENERIC_MIMES = new Set(["application/octet-stream", "application/zip", "application/x-ole-storage", "application/x-ole2"]);

const ALIASES: Readonly<Record<string, readonly string[]>> = {
  "image/jpeg": ["image/jpg"],
  "application/msword": ["application/x-ole-storage", "application/x-ole2"],
  [DOCX]: ["application/zip"],
  [XLSX]: ["application/zip"],
};

export interface CrossCheckResult {
  checked: boolean;
  externalMime: string | null;
  detectedMime: string;
  /**true ⇒ دو منبع با هم تناقض دارند ⇒ درخواست باید رد شود (fail-closed). */
  conflict: boolean;
}

/** بررسی دوم اختیاری؛ بدون loader یا در صورت خطا،checked=false و conflict=false. */
export async function crossCheckWithFileType(
  bytes: Uint8Array,
  loader: SnifferLoader = defaultFileTypeLoader,
): Promise<CrossCheckResult> {
  const local = sniffMagicBytes(bytes);
  const fail = (checked: boolean, externalMime: string | null = null): CrossCheckResult =>
    ({ checked, externalMime, detectedMime: local.mime, conflict: false });
  let sniffer: ExternalSniffer | null;
  try { sniffer = loader(); } catch { return fail(false); }
  if (!sniffer) return fail(false);
  let raw: string | null;
  try { raw = (await sniffer(bytes)).mime; } catch { return fail(true); }
  const externalMime = raw ? normalizeMime(raw) : null;
  if (!externalMime || GENERIC_MIMES.has(externalMime)) return fail(true, externalMime);
  if (externalMime === local.mime) return fail(true, externalMime);
  if ((ALIASES[local.mime] ?? []).includes(externalMime)) return fail(true, externalMime);
  return { checked: true, externalMime, detectedMime: local.mime, conflict: true };
}

// ---------------------------------------------------------------------------
// ماشین وضعیت قرنطینه
// ---------------------------------------------------------------------------

export type QuarantineState = "PENDING" | "SCANNING" | "APPROVED" | "REJECTED";
export type ScanEvent = "START_SCAN" | "CLEAN" | "DIRTY" | "ERROR" | "REJECT";

export type FileSecurityErrorCode = "invalid_transition" | "not_approved";

/** خطای ساده (بدون Nest) تا لایه یکپارچگی آنرا به HTTP exception تبدیل کند. */
export class FileSecurityError extends Error {
  constructor(public readonly code: FileSecurityErrorCode, message: string) {
    super(message);
    this.name = "FileSecurityError";
  }
}

const TRANSITIONS: Readonly<Record<QuarantineState, Readonly<Partial<Record<ScanEvent, QuarantineState>>>>> = {
  PENDING:   { START_SCAN: "SCANNING", REJECT: "REJECTED" },
  SCANNING:  { CLEAN: "APPROVED", DIRTY: "REJECTED", ERROR: "REJECTED", REJECT: "REJECTED" },
  APPROVED:  {},
  REJECTED:  {},
};

export function canTransition(from: QuarantineState, event: ScanEvent): boolean {
  return TRANSITIONS[from]?.[event] !== undefined;
}

/** انتقال وضعیت؛ هر انتقالی که در لیست مجاز نیست ⇒ خطا (fail-closed). */
export function transition(from: QuarantineState, event: ScanEvent): QuarantineState {
  const to = TRANSITIONS[from]?.[event];
  if (!to) throw new FileSecurityError("invalid_transition", `invalid transition: ${from} + ${event}`);
  return to;
}

/** وضعیت اولیه بر اساس تصمیم امنیتی: تنها فایل پذیرفتهشده وارد PENDING میشود. */
export function initialState(decision: Pick<SecurityDecision, "ok">): QuarantineState {
  return decision.ok ? "PENDING" : "REJECTED";
}

/** تنها وضعیتی که مجاز به ارائه فایل است APPROVED است. */
export function canServe(state: QuarantineState): boolean {
  return state === "APPROVED";
}

export function assertServable(state: QuarantineState): void {
  if (!canServe(state)) throw new FileSecurityError("not_approved", `file is not approved (state=${state})`);
}

/** نگاشت نتیجه‌ی اسکنر به رویداد ماشین وضعیت (ERROR ⇒ DIRTY ⇒ رد؛ fail-closed). */
export type ScanVerdict = "CLEAN" | "INFECTED" | "ERROR";
export function verdictToEvent(verdict: ScanVerdict): "CLEAN" | "DIRTY" | "ERROR" {
  return verdict === "CLEAN" ? "CLEAN" : verdict === "INFECTED" ? "DIRTY" : "ERROR";
}

// ---------------------------------------------------------------------------
// لاگ عاری از PHI
// ---------------------------------------------------------------------------

const SAFE_KEY = /^(chat|records)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,10}$/i;

/** فقط کلید شیء server-generated مجاز است؛ در غیر این صورت جایگزین بیخطر. */
export function safeObjectKey(objectKey: string): string {
  return SAFE_KEY.test(objectKey) ? objectKey : "<invalid-key>";
}

/** فقط پسوند فایل لاگ میشود — هرگز نام فایل (که میتواند حاوی نام بیمار باشد). */
export function safeExtension(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  if (i <= 0 || i === fileName.length - 1) return "<none>";
  const ext = fileName.slice(i + 1).toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(ext) ? `.${ext}` : "<none>";
}

export interface SafeLogContext {
  objectKey: string;
  ext: string;
}

/** تنها ساختاری که باید وارد logger شود. */
export function safeLogContext(objectKey: string, fileName?: string): SafeLogContext {
  return { objectKey: safeObjectKey(objectKey), ext: fileName === undefined ? "<none>" : safeExtension(fileName) };
}

/** لاگ تصمیم: شناسه قانون و کد خطا هم غیر PHIاند. */
export function decisionLogContext(
  decision: Pick<SecurityDecision, "code" | "rule">,
  objectKey: string,
  fileName?: string,
): SafeLogContext & { code: DecisionCode; rule: string } {
  return { ...safeLogContext(objectKey, fileName), code: decision.code, rule: decision.rule };
}
