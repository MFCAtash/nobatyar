/**
 * M11 — تصمیمگیرندهٔ Canary (خالص و قطعی).
 *
 * هدف: gateway تصمیم promote/hold/rollback را بر اساس burn rate چندپنجرهای
 * بگیرد، نه بر اساس حدس اپراتور. هر تصمیم قابل بازبینی و آزمونپذیر است.
 */

export type CanaryDecision = "promote" | "hold" | "rollback";

export interface CanarySignal {
  /** نسبت خطا در پنجرهٔ ۱ ساعت (۰..۱) */
  errorRate1h: number;
  /** همان مقدار در ۶ ساعت */
  errorRate6h: number;
  /** نرخ مصرف بودجهٔ خطا (۱ = مصرف مجاز) */
  burnRate: number;
  /** آیا نمونهها از نظر آماری معتبراند؟ */
  significant: boolean;
  /** سلامت آخرین مرحلهٔ canary قبل از این پنجره */
  previousHealthy: boolean;
}

export interface CanaryPolicy {
  /** حداکثر burn rate مجاز (مثلاً ۱) */
  maxBurnRate: number;
  /** اگر burn از این مقدار بگذرد ⇒ rollback فوری */
  hardAbortMultiplier: number;
}

export const DEFAULT_CANARY_POLICY: CanaryPolicy = {
  maxBurnRate: 1,
  hardAbortMultiplier: 5,
};

/** مراحل وزندهی مجاز؛ باید یکنوا و ۱۰۰ باشد. */
export const CANARY_WEIGHTS = [1, 5, 10, 25, 50, 100] as const;

export function isValidWeights(weights: number[]): boolean {
  if (weights.length === 0) return false;
  let prev = 0;
  for (const w of weights) {
    if (!Number.isInteger(w) || w <= prev || w > 100) return false;
    prev = w;
  }
  return weights[weights.length - 1] === 100;
}

/**
 * سیاست تصمیم:
 *  - burn > max * multiplier ⇒ rollback (نقض شدید)
 *  - burn > max یا نمونه نامعتبر یا نسخهٔ قبلی ناسالم ⇒ hold
 *  - در غیر این صورت ⇒ promote به وزن بعدی
 */
export function decideCanary(signal: CanarySignal, policy: CanaryPolicy = DEFAULT_CANARY_POLICY): CanaryDecision {
  if (!Number.isFinite(signal.burnRate) || !Number.isFinite(signal.errorRate1h) || !Number.isFinite(signal.errorRate6h)) {
    return "rollback";
  }
  if (signal.burnRate > policy.maxBurnRate * policy.hardAbortMultiplier) return "rollback";
  if (!signal.significant || !signal.previousHealthy) return "hold";
  if (signal.burnRate > policy.maxBurnRate) return "hold";
  // الگوی多在پنجره: هر دو پنجره بد شوند حتی اگر burn میانگین کم باشد ⇒ hold
  if (signal.errorRate1h > 0 && signal.errorRate6h > 0 && signal.errorRate1h > signal.errorRate6h * 2) return "hold";
  return "promote";
}

/** نام مرحلهٔ بعدی وزندهی؛ وزن ۱۰۰ یعنی انتشار کامل. */
export function nextWeight(weights: readonly number[], current: number): number | null {
  const n = weights.find((w) => w > current);
  return n ?? null;
}
