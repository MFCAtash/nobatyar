/**
 * M5 — مغز ارکستراتور اعلان (خالص و قطعی).
 *
 * همهٔ تصمیم‌ها بدون I/O انجام می‌شوند تا در تست و در بازبینی بالینی قابل اثبات باشند:
 *  - انتخاب کانال بر اساس ترجیح کاربر + ساعات سکوت (quiet hours)
 *  - اعلان‌های امنیتی/فوری از ساعات سکوت عبور می‌کنند
 *  - رندر قالب نسخه‌دار با متغیرهای مجاز (بدون HTML و بدون PHI ناخواسته)
 */

export const CHANNELS = ["inapp", "sms", "push", "email"] as const;
export type Channel = (typeof CHANNELS)[number];

export const EVENT_TYPES = [
  "APPOINTMENT_REMINDER",
  "APPOINTMENT_CONFIRMED",
  "APPOINTMENT_CANCELLED",
  "PAYMENT",
  "CHAT",
  "SECOND_OPINION",
  "SECURITY",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type PreferenceMatrix = Record<EventType, Record<Channel, boolean>>;

const row = (inapp: boolean, sms: boolean, push: boolean, email: boolean) => ({
  inapp, sms, push, email,
});

/** ماتریس پیش‌فرض: یادآوری‌ها چندکاناله، اعلان‌های کم‌اهمیت فقط درون‌برنامه‌ای. */
export const DEFAULT_PREFERENCES: PreferenceMatrix = {
  APPOINTMENT_REMINDER: row(true, true, true, false),
  APPOINTMENT_CONFIRMED: row(true, true, true, false),
  APPOINTMENT_CANCELLED: row(true, true, true, false),
  PAYMENT: row(true, false, false, false),
  CHAT: row(true, false, true, false),
  SECOND_OPINION: row(true, false, true, false),
  SECURITY: row(true, true, true, true),
};

export interface PreferenceRow {
  eventType: string;
  channel: string;
  enabled: boolean;
  quietFrom?: string | null;
  quietTo?: string | null;
}

/** "22:00" ⇒ 1320؛ ورودی نامعتبر ⇒ null (به‌جای حدس). */
export function parseClock(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** آیا زمان در بازهٔ سکوت است؟ بازهٔ شبانه (۲۲:۰۰→۰۷:۰۰) هم پشتیبانی می‌شود. */
export function inQuietHours(nowMinutes: number, from: string | null | undefined, to: string | null | undefined): boolean {
  const a = parseClock(from);
  const b = parseClock(to);
  if (a === null || b === null || a === b) return false;
  const t = ((nowMinutes % 1440) + 1440) % 1440;
  return a < b ? t >= a && t < b : t >= a || t < b;
}

/** ترجیحات کاربر روی پیش‌فرض‌ها سوار می‌شود؛ ردیف ناشناخته نادیده گرفته می‌شود. */
export function mergePreferences(rows: PreferenceRow[]): PreferenceMatrix {
  const out = structuredClone(DEFAULT_PREFERENCES);
  for (const r of rows) {
    if (!(EVENT_TYPES as readonly string[]).includes(r.eventType)) continue;
    if (!(CHANNELS as readonly string[]).includes(r.channel)) continue;
    out[r.eventType as EventType][r.channel as Channel] = r.enabled;
  }
  return out;
}

export interface SelectChannelsInput {
  eventType: EventType;
  prefs: PreferenceMatrix;
  /** دقیقهٔ محلی کاربر (۰..۱۴۳۹). */
  nowMinutes: number;
  quietFrom?: string | null;
  quietTo?: string | null;
  /** فوری/امنیتی ⇒ ساعات سکوت نادیده گرفته می‌شود. */
  urgent?: boolean;
}

/**
 * کانال‌های مؤثر:
 *  - `inapp` همیشه در فهرست است (سابقهٔ اعلان در محصول) مگر کاربر صریحاً خاموش کند.
 *  - در ساعات سکوت فقط کانال‌های «مزاحم» (sms/push/email) حذف می‌شوند.
 *  - فوری/امنیتی: ساعات سکوت اعمال نمی‌شود.
 */
export function selectChannels(input: SelectChannelsInput): Channel[] {
  const prefs = input.prefs[input.eventType] ?? DEFAULT_PREFERENCES[input.eventType];
  const quiet = !input.urgent && inQuietHours(input.nowMinutes, input.quietFrom, input.quietTo);
  const picked: Channel[] = [];
  for (const ch of CHANNELS) {
    if (!prefs[ch]) continue;
    if (quiet && ch !== "inapp") continue;
    picked.push(ch);
  }
  // inapp فقط وقتی حذف می‌شود که کاربر صریحاً خاموش کرده باشد.
  return picked;
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const MAX_VAR_LEN = 200;

/** پاک‌سازی مقدار متغیر: حذف کاراکترهای کنترلی و محدودیت طول (جلوگیری از تزریق/نشت). */
export function sanitizeVar(value: unknown): string {
  const s = String(value ?? "");
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX_VAR_LEN);
}

export class TemplateError extends Error {}

/**
 * رندر قالب فارسی. هر placeholder باید در `vars` باشد؛ placeholder باقی‌مانده ⇒ خطا
 * (به‌جای ارسال متن خام به کاربر).
 */
export function renderTemplate(bodyFa: string, vars: Record<string, unknown>): string {
  const missing: string[] = [];
  const out = bodyFa.replace(PLACEHOLDER, (_, key: string) => {
    if (!(key in vars)) {
      missing.push(key);
      return "";
    }
    return sanitizeVar(vars[key]);
  });
  if (missing.length) throw new TemplateError(`missing template vars: ${[...new Set(missing)].join(",")}`);
  return out;
}

export interface TemplateRow {
  key: string;
  version: number;
  channels: string;
  bodyFa: string;
  abGroup?: string | null;
  enabled: boolean;
}

/** نسخهٔ فعال: بالاترین version با enabled=true. */
export function pickActiveTemplate(rows: TemplateRow[], key: string): TemplateRow | null {
  return rows
    .filter((r) => r.key === key && r.enabled)
    .sort((a, b) => b.version - a.version)[0] ?? null;
}

/** کانال‌های مجاز یک قالب (JSON آرایه)؛ ورودی خراب ⇒ null یعنی «همهٔ کانال‌ها». */
export function parseTemplateChannels(raw: string): Channel[] | null {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    const ok = arr.filter((c): c is Channel => (CHANNELS as readonly string[]).includes(c));
    return ok.length ? [...new Set(ok)] : null;
  } catch {
    return null;
  }
}

/** آیا کانال انتخابی با قالب سازگار است؟ */
export function filterByTemplate(channels: Channel[], template: TemplateRow | null): Channel[] {
  if (!template) return channels;
  const allowed = parseTemplateChannels(template.channels);
  if (!allowed) return channels;
  return channels.filter((c) => allowed.includes(c));
}
