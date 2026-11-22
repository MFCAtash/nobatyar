import { createHash } from "node:crypto";

/**
 * M13 — فونل محصول، بدون PHI.
 *
 * قواعد سخت:
 *  - فقط «مرحله» و متادیتای allow-list ذخیره می‌شود؛ هر کلید دیگر رد می‌شود.
 *  - شناسهٔ کاربر هرگز خام ذخیره نمی‌شود؛ با salt سمت سرور هش می‌شود.
 *  - هیچ فیلد آزاد متنی (نام، شماره، علت مراجعه) پذیرفته نمی‌شود.
 */

export const FUNNEL_STEPS = [
  "SEARCH",
  "SLOT_VIEW",
  "SLOT_SELECT",
  "PAYMENT_START",
  "PAYMENT_SUCCESS",
  "BOOKING_CONFIRMED",
] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

/** ترتیب مراحل برای محاسبهٔ نرخ تبدیل؛ ثبت خارج از ترتیب مجاز است ولی در فونل شمرده نمی‌شود. */
export const STEP_ORDER: Record<FunnelStep, number> = {
  SEARCH: 0,
  SLOT_VIEW: 1,
  SLOT_SELECT: 2,
  PAYMENT_START: 3,
  PAYMENT_SUCCESS: 4,
  BOOKING_CONFIRMED: 5,
};

/** فقط این کلیدها مجازند؛ مقدار باید اسکالر کوتاه باشد. */
export const META_ALLOWED_KEYS = ["role", "channel", "variant", "device", "step_ms"] as const;
export type MetaKey = (typeof META_ALLOWED_KEYS)[number];

const MAX_META_LEN = 64;

export class FunnelError extends Error {}

export function isFunnelStep(v: string): v is FunnelStep {
  return (FUNNEL_STEPS as readonly string[]).includes(v);
}

/** متادیتا را به یک آبجکت امن و قطعی تبدیل می‌کند؛ کلید/مقدار غیرمجاز ⇒ خطا. */
export function sanitizeMeta(meta: Record<string, unknown> | undefined | null): Record<string, string> {
  if (!meta) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (!(META_ALLOWED_KEYS as readonly string[]).includes(k)) throw new FunnelError(`meta key not allowed: ${k}`);
    if (v === null || v === undefined) continue;
    if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") {
      throw new FunnelError(`meta value must be scalar: ${k}`);
    }
    const s = String(v).trim();
    if (!s) continue;
    if (s.length > MAX_META_LEN) throw new FunnelError(`meta value too long: ${k}`);
    // جلوگیری از تزریق هر چیز شبیه ایمیل/تلفن در مقدارهای متنی
    if (/@|\+?\d{10,}/.test(s)) throw new FunnelError(`meta value looks like PII: ${k}`);
    out[k] = s;
  }
  return out;
}

/** هش متادیتا با salt سرور؛ خروجی hex کوتاه و غیرقابل بازگشت. */
export function hashMeta(meta: Record<string, string>, salt: string): string | null {
  const keys = Object.keys(meta).sort();
  if (keys.length === 0) return null;
  const canonical = JSON.stringify(keys.map((k) => [k, meta[k]]));
  return createHash("sha256").update(`${salt}:${canonical}`).digest("hex").slice(0, 32);
}

/** شناسهٔ ناشناس: HMAC-مانند با salt؛ ورودی خام هیچ‌گاه ذخیره نمی‌شود. */
export function anonymousId(rawId: string, salt: string): string {
  const v = String(rawId ?? "").trim();
  if (v.length < 8 || v.length > 200) throw new FunnelError("anonymous id length invalid");
  return createHash("sha256").update(`${salt}:anon:${v}`).digest("hex").slice(0, 32);
}

export interface FunnelCount {
  step: FunnelStep;
  count: number;
  /** تبدیل نسبت به مرحلهٔ قبلی (۰..۱)؛ مرحلهٔ اول ۱. */
  conversionFromPrev: number;
}

/**
 * شمارش یکتا بر اساس anonymousId برای هر مرحله (نه تعداد رخداد) و محاسبهٔ
 * نرخ تبدیل مرحله‌به‌مرحله. مراحل با ترتیب STEP_ORDER گزارش می‌شوند.
 */
export function computeFunnel(events: Array<{ anonymousId: string; step: string }>): FunnelCount[] {
  const seen = new Map<FunnelStep, Set<string>>();
  for (const s of FUNNEL_STEPS) seen.set(s, new Set());
  for (const e of events) {
    if (!isFunnelStep(e.step)) continue;
    seen.get(e.step)!.add(e.anonymousId);
  }
  let prev = 0;
  return FUNNEL_STEPS.map((step, i) => {
    const count = seen.get(step)!.size;
    const conversionFromPrev = i === 0 ? 1 : prev === 0 ? 0 : Math.round((count / prev) * 1000) / 1000;
    prev = count;
    return { step, count, conversionFromPrev };
  });
}

export interface CohortRow {
  /** ISO هفتهٔ شروع (دوشنبه). */
  cohort: string;
  size: number;
  /** retention[0] همیشه ۱ است؛ retention[n] نسبت اعضای فعال در هفتهٔ n. */
  retention: number[];
}

function weekStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (x.getUTCDay() + 6) % 7; // دوشنبه = ۰
  x.setUTCDate(x.getUTCDate() - day);
  return x;
}

const WEEK_MS = 7 * 86_400_000;

/** cohort/retention بر پایهٔ اولین رخداد هر کاربر و حضور در هفته‌های بعد. */
export function computeCohorts(
  events: Array<{ anonymousId: string; at: Date }>,
  opts: { maxWeeks?: number } = {},
): CohortRow[] {
  const maxWeeks = Math.min(Math.max(opts.maxWeeks ?? 8, 1), 26);
  const byUser = new Map<string, Date[]>();
  for (const e of events) {
    if (Number.isNaN(e.at.getTime())) continue;
    const arr = byUser.get(e.anonymousId) ?? [];
    arr.push(e.at);
    byUser.set(e.anonymousId, arr);
  }
  const cohorts = new Map<string, { users: Map<string, Set<number>> }>();
  for (const [user, dates] of byUser) {
    dates.sort((a, b) => a.getTime() - b.getTime());
    const start = weekStart(dates[0]);
    const key = start.toISOString().slice(0, 10);
    const bucket = cohorts.get(key) ?? { users: new Map<string, Set<number>>() };
    const weeks = new Set<number>();
    for (const d of dates) {
      const w = Math.floor((weekStart(d).getTime() - start.getTime()) / WEEK_MS);
      if (w >= 0 && w < maxWeeks) weeks.add(w);
    }
    bucket.users.set(user, weeks);
    cohorts.set(key, bucket);
  }
  return [...cohorts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cohort, b]) => {
      const size = b.users.size;
      const retention = Array.from({ length: maxWeeks }, (_, w) => {
        if (size === 0) return 0;
        let n = 0;
        for (const weeks of b.users.values()) if (weeks.has(w)) n++;
        return Math.round((n / size) * 1000) / 1000;
      });
      return { cohort, size, retention };
    });
}

export const NPS_MIN = 0;
export const NPS_MAX = 10;

export type NpsBucket = "promoter" | "passive" | "detractor";

export function classifyNps(score: number): NpsBucket {
  if (!Number.isInteger(score) || score < NPS_MIN || score > NPS_MAX) throw new FunnelError("nps score must be 0..10");
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

/** NPS = ٪مروجین - ٪منتقدان (بازهٔ -۱۰۰..۱۰۰). */
export function npsScore(scores: number[]): number {
  if (scores.length === 0) return 0;
  let promoters = 0;
  let detractors = 0;
  for (const s of scores) {
    const b = classifyNps(s);
    if (b === "promoter") promoters++;
    if (b === "detractor") detractors++;
  }
  return Math.round(((promoters - detractors) / scores.length) * 100);
}
