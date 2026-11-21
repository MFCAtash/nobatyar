import { createHash } from "node:crypto";

/**
 * Idempotency-Key برای endpoint های مالی (الگوی Stripe/IETF draft-ietf-httpapi-idempotency-key):
 *  - کلاینت برای «یک قصد» (یک کلیک روی «پرداخت») یک کلید یکتا می‌سازد و در «تلاش مجدد» همان را می‌فرستد.
 *  - همان کلید + همان درخواست ⇒ همان پاسخِ ذخیره‌شده (بدون اجرای دوباره)؛ همان کلید + درخواست دیگر ⇒ ۴۲۲.
 *  - درخواست هم‌زمانِ هم‌کلید ⇒ ۴۰۹ با Retry-After (نه اجرای دوباره).
 */
export const IDEMPOTENCY_HEADER = "idempotency-key";
export const REPLAY_HEADER = "Idempotent-Replayed";

export const KEY_MIN = 16;
export const KEY_MAX = 128;
/** UUID/ULID/رشته‌ی تصادفی؛ حروف و عدد و - _ . : */
const KEY_RE = /^[A-Za-z0-9._:-]+$/;

export const LOCK_MS = 2 * 60_000;
export const COMPLETED_TTL_MS = 24 * 3_600_000;
export const MAX_STORED_BYTES = 64 * 1024;

export type KeyCheck = { ok: true; key: string } | { ok: false; code: "idempotency_key_required" | "idempotency_key_invalid" };

export function parseKey(raw: string | string[] | undefined, required: boolean): KeyCheck | { ok: true; key: null } {
  const v = Array.isArray(raw) ? (raw.length === 1 ? raw[0] : "") : raw;
  if (v === undefined) return required ? { ok: false, code: "idempotency_key_required" } : { ok: true, key: null };
  if (v.length < KEY_MIN || v.length > KEY_MAX || !KEY_RE.test(v)) return { ok: false, code: "idempotency_key_invalid" };
  return { ok: true, key: v };
}

/** JSON با کلیدهای مرتب ⇒ ترتیب فیلدها اثری در اثرانگشت ندارد. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
}

/** اثرانگشت درخواست: متد + مسیرِ «واقعی» (شامل شناسه‌ها و query) + بدنه. */
export function fingerprint(method: string, url: string, body: unknown): string {
  return createHash("sha256").update(`${method.toUpperCase()}\n${url}\n${canonicalJson(body ?? null)}`).digest("hex");
}

/** دامنه‌ی یکتایی کلید: هر کاربر فضای کلید خودش را دارد (کلید یک کاربر هرگز به کاربر دیگر پاسخ نمی‌دهد). */
export const scopeOf = (userId: string, method: string, routeTemplate: string): string => `${userId}:${method.toUpperCase()} ${routeTemplate}`;

export interface StoredKey {
  fingerprint: string;
  state: "IN_PROGRESS" | "COMPLETED";
  lockedUntil: Date;
  expiresAt: Date;
  statusCode: number | null;
  response: unknown;
}

export type Decision =
  | { kind: "execute" }
  | { kind: "takeover" }
  | { kind: "replay"; status: number; body: unknown }
  | { kind: "in_progress"; retryAfterSec: number }
  | { kind: "mismatch" };

/** تصمیم خالص برای ردیف موجود (ردیف منقضی قبلاً توسط store حذف می‌شود). */
export function decide(existing: StoredKey | null, fp: string, now: Date): Decision {
  if (!existing || existing.expiresAt.getTime() <= now.getTime()) return { kind: "execute" };
  if (existing.fingerprint !== fp) return { kind: "mismatch" };
  if (existing.state === "COMPLETED") return { kind: "replay", status: existing.statusCode ?? 200, body: existing.response };
  if (existing.lockedUntil.getTime() <= now.getTime()) return { kind: "takeover" }; // پروسه‌ی قبلی احتمالاً مرده است
  return { kind: "in_progress", retryAfterSec: Math.max(1, Math.ceil((existing.lockedUntil.getTime() - now.getTime()) / 1000)) };
}

/** فقط پاسخ‌های موفق و کوچک ذخیره می‌شوند. */
export function shouldStore(status: number, body: unknown): boolean {
  if (status < 200 || status >= 300) return false;
  try { return Buffer.byteLength(JSON.stringify(body ?? null)) <= MAX_STORED_BYTES; } catch { return false; }
}
