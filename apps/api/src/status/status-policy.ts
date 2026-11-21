/**
 * صفحه‌ی وضعیت عمومی — منطق خالص. اصل‌ها:
 *  - فقط «وضعیت» نمایش داده می‌شود؛ هیچ عدد/نام/شناسه‌ی داخلی (حتی تعداد کاربر یا پرداخت) به عموم نمی‌رسد.
 *  - هر probe با timeout و خطا ⇒ همان مؤلفه «outage» (نه استثنا؛ صفحه‌ی وضعیت نباید خودش از کار بیفتد).
 *  - تصمیم از «داده‌ی واقعی» می‌آید (DB/Redis/پرداخت/Outbox)، حوادث دستی فقط می‌توانند وضعیت را «بدتر» کنند.
 */
export type ComponentStatus = "operational" | "degraded" | "outage";
export type ComponentId = "api" | "database" | "realtime" | "payments" | "notifications";

export interface Component { id: ComponentId; nameFa: string; status: ComponentStatus }

export const COMPONENT_NAMES: Record<ComponentId, string> = {
  api: "وب‌سایت و API",
  database: "پایگاه‌داده",
  realtime: "چت و اعلان زنده",
  payments: "پرداخت",
  notifications: "اعلان‌ها",
};

const RANK: Record<ComponentStatus, number> = { operational: 0, degraded: 1, outage: 2 };
export const worst = (a: ComponentStatus, b: ComponentStatus): ComponentStatus => (RANK[a] >= RANK[b] ? a : b);
export const rollup = (cs: readonly Pick<Component, "status">[]): ComponentStatus => cs.reduce<ComponentStatus>((acc, c) => worst(acc, c.status), "operational");

export interface Probe { ok: boolean; ms: number }
export const SLOW_MS = 1500;

/** DB / Redis: خطا ⇒ outage؛ کند ⇒ degraded. */
export function probeStatus(p: Probe, slowMs: number = SLOW_MS): ComponentStatus {
  if (!p.ok) return "outage";
  return p.ms > slowMs ? "degraded" : "operational";
}

export interface PaymentWindow {
  paid: number;
  failed: number;
  expired: number;
  mismatch: number;
  /** پرداخت‌شده ولی نوبت هنوز هماهنگ نشده (قدیمی‌تر از ۱۵ دقیقه) */
  paidUnsynced: number;
}

/**
 * پرداخت (پنجره‌ی ۳۰ دقیقه): «فقط ناموفق» (≥۱۰) ⇒ outage (همان منطق PaymentsAllFailing)؛
 * نرخ mismatch ≥ ۱۰٪ یا هر paid-unsynced ⇒ degraded. داده‌ی کم (<۵) ⇒ operational.
 */
export function paymentStatus(w: PaymentWindow): ComponentStatus {
  const total = w.paid + w.failed + w.expired + w.mismatch;
  if (w.paid === 0 && w.failed + w.expired >= 10) return "outage";
  if (w.paidUnsynced > 0) return "degraded";
  if (total >= 5 && w.mismatch / total >= 0.1) return "degraded";
  return "operational";
}

export interface OutboxHealth { oldestPendingSec: number; dead: number }
export function notificationsStatus(h: OutboxHealth): ComponentStatus {
  if (h.oldestPendingSec > 3600) return "outage";
  if (h.oldestPendingSec > 600 || h.dead > 0) return "degraded";
  return "operational";
}

// ───────────── حوادث (دستی) ─────────────
export const INCIDENT_STATUSES = ["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
export const INCIDENT_IMPACTS = ["NONE", "MINOR", "MAJOR", "CRITICAL"] as const;
export type IncidentImpact = (typeof INCIDENT_IMPACTS)[number];

/** حادثه‌ی فعال می‌تواند وضعیت کلی را بدتر کند (MINOR⇒degraded، MAJOR/CRITICAL⇒outage)؛ هرگز بهتر نمی‌کند. */
export function applyIncidents(overall: ComponentStatus, active: readonly { impact: IncidentImpact }[]): ComponentStatus {
  let s = overall;
  for (const i of active) s = worst(s, i.impact === "MAJOR" || i.impact === "CRITICAL" ? "outage" : i.impact === "MINOR" ? "degraded" : "operational");
  return s;
}

export type IncidentCheck = { ok: true } | { ok: false; code: "incident_resolved" | "same_status_empty_update" };

/** حادثه‌ی حل‌شده دیگر به‌روز نمی‌شود (باز کردن مجدد = حادثه‌ی تازه، تا تاریخچه‌ی عمومی درست بماند). */
export function canUpdateIncident(current: IncidentStatus, next: IncidentStatus, hasBody: boolean): IncidentCheck {
  if (current === "RESOLVED") return { ok: false, code: "incident_resolved" };
  if (current === next && !hasBody) return { ok: false, code: "same_status_empty_update" };
  return { ok: true };
}

/**
 * متن حادثه «عمومی» است؛ هر الگوی داده‌ی شخصی رد می‌شود (موبایل، ایمیل، رشته‌ی ≥۸ رقمی، UUID، آدرس IP).
 * (به‌جای «پاک‌سازی بی‌صدا»: ادمین باید بداند چه چیزی نباید بنویسد.)
 */
const PII_PATTERNS: RegExp[] = [
  /(?:\+?98|0)?9\d{9}/,
  /[\w.+-]+@[\w-]+\.[\w.]+/,
  /(?<!\d)\d{8,}(?!\d)/,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
  /(?<!\d)\d{1,3}(?:\.\d{1,3}){3}(?!\d)/,
];
/** ارقام فارسی/عربی ⇒ لاتین (\b و \d ی JS فقط ASCII را می‌شناسد؛ بدون این، «۰۹۱۲…» رد نمی‌شد). */
const toAscii = (t: string): string => t.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
export const containsPersonalData = (text: string): boolean => { const t = toAscii(text); return PII_PATTERNS.some((r) => r.test(t)); };
