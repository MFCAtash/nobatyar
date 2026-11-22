/**
 * M7 — دستیار چت بالینی (منطق خالص و قابل بازبینی).
 *
 * خلاصه «استخراجی» است، نه تولیدی: هیچ ادعای تشخیصی اضافه نمی‌شود و فقط
 * پیام‌های موجود با حذف داده‌های حساس (تلفن/ایمیل/کد ملی/شمارهٔ بلند) بازنویسی می‌شوند.
 */

export type Speaker = "PATIENT" | "DOCTOR";

export interface SummaryMessage {
  speaker: Speaker;
  text: string;
  at?: Date | string;
}

export interface SummaryResult {
  bullets: string[];
  redactions: number;
  considered: number;
}

const PHONE_IR = /(?:\+?98|0)?9\d{9}/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const NATIONAL_ID = /\b\d{10}\b/g;
const LONG_DIGITS = /\b\d{12,}\b/g;

/** حذف شناسه‌های حساس پیش از ذخیره/نمایش خلاصه. */
export function redactSensitive(text: string): { text: string; redactions: number } {
  let redactions = 0;
  let out = text;
  const sub = (re: RegExp, label: string) => {
    out = out.replace(re, () => {
      redactions++;
      return label;
    });
  };
  sub(PHONE_IR, "[تلفن]");
  sub(EMAIL, "[ایمیل]");
  sub(NATIONAL_ID, "[شناسه]");
  sub(LONG_DIGITS, "[شماره]");
  // کاراکترهای کنترلی
  out = out.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return { text: out, redactions };
}

const MAX_BULLET = 160;

/**
 * خلاصهٔ استخراجی: پیام‌های معنادار را از قدیم به جدید می‌گیرد و آخرین `maxBullets`
 * را نگه می‌دارد تا خلاصه بر «آخرین وضعیت» متمرکز باشد.
 */
export function buildSummary(
  messages: SummaryMessage[],
  opts: { maxBullets?: number } = {},
): SummaryResult {
  const maxBullets = Math.min(Math.max(opts.maxBullets ?? 8, 1), 20);
  const seen = new Set<string>();
  const bullets: string[] = [];
  let redactions = 0;
  let considered = 0;

  for (const m of messages) {
    const raw = (m.text ?? "").trim();
    if (!raw) continue;
    considered++;
    const r = redactSensitive(raw);
    redactions += r.redactions;
    const text = r.text.slice(0, MAX_BULLET);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    bullets.push(`${m.speaker === "PATIENT" ? "بیمار" : "پزشک"}: ${text}`);
  }

  return { bullets: bullets.slice(-maxBullets), redactions, considered };
}

/** ساختار ذخیره‌شده؛ نسخه برای مهاجرت‌های بعدی. */
export interface StoredSummary {
  v: 1;
  bullets: string[];
  redactions: number;
  considered: number;
  generatedAt: string;
}

export function serializeSummary(r: SummaryResult, now: Date = new Date()): string {
  const payload: StoredSummary = {
    v: 1,
    bullets: r.bullets,
    redactions: r.redactions,
    considered: r.considered,
    generatedAt: now.toISOString(),
  };
  return JSON.stringify(payload);
}

/** ورودی خراب/قدیمی ⇒ null (به‌جای کرش کردن صفحهٔ چت). */
export function parseStoredSummary(raw: string): StoredSummary | null {
  try {
    const v = JSON.parse(raw) as Partial<StoredSummary>;
    if (v?.v !== 1 || !Array.isArray(v.bullets)) return null;
    return {
      v: 1,
      bullets: v.bullets.filter((b): b is string => typeof b === "string").slice(0, 20),
      redactions: typeof v.redactions === "number" ? v.redactions : 0,
      considered: typeof v.considered === "number" ? v.considered : 0,
      generatedAt: typeof v.generatedAt === "string" ? v.generatedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export const MAX_QUICK_REPLIES = 10;

export function normalizeQuickReply(text: string): string | null {
  const t = text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (t.length < 2 || t.length > 300) return null;
  return t;
}

/** پاسخ‌های تکراری (بدون حساسیت به فاصله/حروف بزرگ) حذف می‌شوند. */
export function dedupeQuickReplies(texts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of texts) {
    const t = normalizeQuickReply(raw);
    if (!t) continue;
    const key = t.replace(/\s+/g, " ").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MAX_QUICK_REPLIES) break;
  }
  return out;
}
