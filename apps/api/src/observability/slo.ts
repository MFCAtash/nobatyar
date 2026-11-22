/**
 * M11 — محاسبات SLO و سیاست اجرای chaos (خالص و قطعی).
 *
 * هدف: خطاهای بودجه به‌صورت «چند برابر مصرف مجاز» بیان شوند (burn rate) و
 * تصمیم هشدار/rollback قابل بازبینی باشد. هیچ I/O در این فایل نیست.
 */

export interface SloTarget {
  service: string;
  /** درصد موفقیت هدف، مثلاً 99.9 */
  objective: number;
  /** پنجرهٔ اعتبار بودجه: "30d" | "7d" | "1d" */
  window: string;
}

export type SloWindow = "1h" | "6h" | "1d" | "3d" | "30d";

export interface BurnSample {
  window: SloWindow;
  /** نسبت خطای مشاهده‌شده (۰..۱) */
  errorRate: number;
  /** تعداد کل درخواست‌ها در همان پنجره (برای معنی‌داری آماری) */
  requests: number;
}

export interface BurnRateResult {
  window: SloWindow;
  burnRate: number;
  /** بودجهٔ خطای مجاز در همین پنجره (۰..۱) */
  budget: number;
  significant: boolean;
}

const WINDOW_MS: Record<SloWindow, number> = {
  "1h": 3_600_000,
  "6h": 21_600_000,
  "1d": 86_400_000,
  "3d": 259_200_000,
  "30d": 2_592_000_000,
};

/** حداقل نمونه برای معنی‌دار بودن؛ کمتر از این، burn rate «غیرقطعی» است. */
export const MIN_REQUESTS = 20;

export function parseObjective(objective: number): number {
  if (!Number.isFinite(objective) || objective <= 0 || objective >= 100) {
    throw new Error("objective must be a percentage between 0 and 100 (exclusive)");
  }
  return objective;
}

/** بودجهٔ خطای مجاز = 1 - objective/100 */
export function errorBudget(target: SloTarget): number {
  return 1 - parseObjective(target.objective) / 100;
}

/**
 * burn rate = errorRate / budget. مقدار ۱ یعنی «دقیقاً در حال مصرف کامل بودجه»؛
 * ۱۴.۴ معادل هشدار چند-پنجره‌ای استاندارد است.
 */
export function burnRate(target: SloTarget, errorRate: number): number {
  const budget = errorBudget(target);
  if (budget <= 0) return Number.POSITIVE_INFINITY;
  const rate = Math.max(0, Math.min(1, Number.isFinite(errorRate) ? errorRate : 0));
  return Math.round((rate / budget) * 1000) / 1000;
}

export function computeBurn(target: SloTarget, samples: BurnSample[]): BurnRateResult[] {
  return samples.map((s) => ({
    window: s.window,
    burnRate: burnRate(target, s.errorRate),
    budget: errorBudget(target),
    significant: s.requests >= MIN_REQUESTS,
  }));
}

export type AlertSeverity = "ok" | "ticket" | "page" | "rollback";

/**
 * سیاست چند-پنجره‌ای (الهام‌گرفته از SRE Workbook):
 *  - 1h/6h هر دو > 14.4 ⇒ rollback (نقض شدید و پایدار)
 *  - 1h > 14.4 یا 6h > 6 ⇒ page
 *  - 1d > 1 ⇒ ticket
 * نمونهٔ کم‌حجم هرگز باعث page/rollback نمی‌شود.
 */
export function alertSeverity(results: BurnRateResult[]): AlertSeverity {
  const get = (w: SloWindow) => results.find((r) => r.window === w);
  const oneH = get("1h");
  const sixH = get("6h");
  const oneD = get("1d");

  const sig = (r: BurnRateResult | undefined) => Boolean(r?.significant);
  if (sig(oneH) && sig(sixH) && oneH!.burnRate > 14.4 && sixH!.burnRate > 14.4) return "rollback";
  if ((sig(oneH) && oneH!.burnRate > 14.4) || (sig(sixH) && sixH!.burnRate > 6)) return "page";
  if (sig(oneD) && oneD!.burnRate > 1) return "ticket";
  return "ok";
}

/** درصد بودجهٔ باقی‌مانده در پنجرهٔ هدف (بر اساس نرخ خطای ۳۰ روزه). */
export function remainingBudgetPct(target: SloTarget, errorRate30d: number): number {
  const budget = errorBudget(target);
  if (budget <= 0) return 0;
  const used = Math.max(0, Math.min(1, errorRate30d)) / budget;
  return Math.round(Math.max(0, 1 - used) * 1000) / 10;
}

export function windowMs(window: SloWindow): number {
  return WINDOW_MS[window];
}

// ─── Chaos ────────────────────────────────────────────────────────────────

export const CHAOS_TARGETS = [
  "redis",
  "postgres-replica",
  "payment-gateway",
  "sms-provider",
  "livekit",
] as const;
export type ChaosTarget = (typeof CHAOS_TARGETS)[number];

export interface ChaosRequest {
  target: string;
  environment: string;
  /** پنجرهٔ مجاز اجرا (برای جلوگیری از اجرا در ساعات اوج). */
  nowMinutes: number;
  windowFrom?: string;
  windowTo?: string;
  /** تأیید صریح اپراتور. */
  approved: boolean;
}

export interface ChaosDecision {
  allowed: boolean;
  reason: string;
  /** همیشه rollback خودکار در پایان drill. */
  autoRollback: true;
}

function inWindow(t: number, from?: string, to?: string): boolean {
  if (!from || !to) return true;
  const p = (v: string) => {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(v);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const a = p(from);
  const b = p(to);
  if (a === null || b === null || a === b) return true;
  const m = ((t % 1440) + 1440) % 1440;
  return a < b ? m >= a && m < b : m >= a || m < b;
}

/**
 * chaos فقط در محیط غیر production، هدف allow-list، تأیید صریح و پنجرهٔ مجاز.
 * در production همیشه رد می‌شود (حتی با تأیید).
 */
export function authorizeChaos(req: ChaosRequest): ChaosDecision {
  if (req.environment === "production") {
    return { allowed: false, reason: "chaos_disabled_in_production", autoRollback: true };
  }
  if (!req.approved) return { allowed: false, reason: "approval_required", autoRollback: true };
  if (!(CHAOS_TARGETS as readonly string[]).includes(req.target)) {
    return { allowed: false, reason: "target_not_allowed", autoRollback: true };
  }
  if (!inWindow(req.nowMinutes, req.windowFrom, req.windowTo)) {
    return { allowed: false, reason: "outside_change_window", autoRollback: true };
  }
  return { allowed: true, reason: "allowed", autoRollback: true };
}

export const RUNBOOKS = ["restore-drill", "redis-failover", "payment-failover"] as const;
export type RunbookName = (typeof RUNBOOKS)[number];

export function authorizeRunbook(name: string, environment: string): { allowed: boolean; reason: string } {
  if (!(RUNBOOKS as readonly string[]).includes(name)) return { allowed: false, reason: "unknown_runbook" };
  if (environment === "production" && name === "restore-drill") {
    // restore-drill در production فقط با پنجرهٔ اعلام‌شده و از طریق CI مجاز است.
    return { allowed: false, reason: "production_requires_ci" };
  }
  return { allowed: true, reason: "allowed" };
}
