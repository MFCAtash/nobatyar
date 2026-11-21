/**
 * پاک‌سازی رویدادهای مانیتورینگ (Sentry) پیش از خروج از سامانه — «داده‌ی بیمار نباید به سرویس خارجی برود».
 * خالص و بدون وابستگی؛ هم API (@sentry/node) و هم وب (@sentry/browser) از همین تابع در beforeSend استفاده می‌کنند.
 *
 * اصول:
 *  ۱) allowlist برای «ساختار»: از request فقط method و URL بدون query می‌ماند؛ بدنه، کوکی، هدرها، user و server_name حذف می‌شوند.
 *  ۲) denylist برای «کلیدها»: هر کلیدی که حاوی داده‌ی پزشکی/شخصی/رازی باشد (reason, soap, diagnosis, phone, token, …) مقدارش حذف می‌شود.
 *  ۳) الگو برای «رشته‌ها»: JWT، موبایل، ایمیل، کد ملی ۱۰ رقمی و رشته‌های hex/base64 بلند، حتی داخل پیام خطا، پاک می‌شوند.
 *  ۴) fail-closed: هر خطا در پاک‌سازی ⇒ رویداد کلاً دور ریخته می‌شود (null).
 */

export const FILTERED = "[Filtered]";

/** کلیدهایی که مقدارشان همیشه امن است (عملیاتی، بدون داده‌ی فردی). */
const SAFE_KEYS = new Set([
  "status", "statuscode", "status_code", "method", "type", "level", "logger", "platform", "release", "environment",
  "op", "event_id", "timestamp", "start_timestamp", "trace_id", "span_id", "parent_span_id", "sdk", "version", "category",
]);

/** زیررشته‌های (حروف کوچک) کلیدهای حساس. */
const SENSITIVE_PARTS = [
  // پزشکی
  "reason", "soap", "subjective", "objective", "assessment", "diagnos", "icd", "prescri", "medic", "drug", "allerg",
  "condition", "symptom", "complaint", "note", "clinical", "health", "record", "attachment", "triage", "bloodtype", "chronic",
  "weight", "height", "pregnan", "dose",
  // هویت/تماس
  "phone", "mobile", "tel", "national", "email", "mail", "fullname", "firstname", "lastname", "name", "birth", "dob",
  "address", "gender", "bio", "ip",
  // محتوا
  "body", "message", "msg", "content", "text", "payload", "data", "comment",
  // اسرار/احراز/مالی
  "token", "auth", "cookie", "session", "password", "passwd", "otp", "secret", "key", "authority", "card", "pan", "cvv", "iban", "refid", "sheba", "credential", "signature", "jwt",
];

// ip: «ip» در کلمه‌هایی مثل "description" هم هست؛ برای کلید کوتاه فقط تطبیق کامل/مرزدار.
const SHORT_EXACT = new Set(["ip", "tel", "dob", "pan", "msg"]);

export function isSensitiveKey(rawKey: string): boolean {
  const k = rawKey.toLowerCase();
  if (SAFE_KEYS.has(k)) return false;
  for (const p of SENSITIVE_PARTS) {
    if (SHORT_EXACT.has(p)) {
      if (k === p || k.startsWith(`${p}_`) || k.endsWith(`_${p}`) || k.includes(`_${p}_`)) return true;
    } else if (k.includes(p)) return true;
  }
  return false;
}

const FA = "۰۱۲۳۴۵۶۷۸۹";
const AR = "٠١٢٣٤٥٦٧٨٩";
const toAscii = (s: string): string => s.replace(/[۰-۹٠-٩]/g, (c) => String(FA.indexOf(c) >= 0 ? FA.indexOf(c) : AR.indexOf(c)));

const PATTERNS: [RegExp, string][] = [
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, "[jwt]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [token]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
  [/(?<![\d])(?:\+?98|0098|0)?9\d{9}(?![\d])/g, "[phone]"],
  [/(?<![\d])\d{10}(?![\d])/g, "[id-number]"],
  [/\b[A-Fa-f0-9]{32,}\b/g, "[hex]"],
  [/\b[A-Za-z0-9+/_-]{40,}={0,2}(?![A-Za-z0-9])/g, "[secret]"],
];

export function scrubString(s: string): string {
  let out = toAscii(s);
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  return out;
}

/** query و hash را از URL حذف می‌کند (ممکن است authority، توکن یا شماره داشته باشد). */
export function scrubUrl(u: unknown): string | undefined {
  if (typeof u !== "string") return undefined;
  return scrubString(u.replace(/[?#].*$/, ""));
}

type Json = unknown;

/** پاک‌سازی عمیق: کلید حساس ⇒ مقدار حذف؛ رشته ⇒ الگو؛ عمق/اندازه محدود. */
export function scrubDeep(v: Json, depth = 0): Json {
  if (depth > 8) return FILTERED;
  if (typeof v === "string") return scrubString(v);
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => scrubDeep(x, depth + 1));
  if (v && typeof v === "object") {
    const out: Record<string, Json> = {};
    for (const [k, val] of Object.entries(v as Record<string, Json>)) {
      out[k] = isSensitiveKey(k) ? FILTERED : scrubDeep(val, depth + 1);
    }
    return out;
  }
  return v;
}

/** شیء آزاد (رویداد Sentry). عمداً `unknown`: هر فیلد قبل از استفاده باید با rec()/recs() باریک شود (بدون any). */
type Ev = Record<string, unknown>;
const rec = (v: unknown): Ev | undefined => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Ev) : undefined);
const recs = (v: unknown): Ev[] => (Array.isArray(v) ? v.filter((x): x is Ev => rec(x) !== undefined) : []);

/** فریم‌های stack: متغیرهای محلی و خطوط کد منبع ممکن است داده‌ی بیمار داشته باشند ⇒ حذف. */
const FRAME_DROP = new Set(["vars", "pre_context", "post_context", "context_line"]);
const omit = (o: Ev, drop: Set<string>): Ev => Object.fromEntries(Object.entries(o).filter(([k]) => !drop.has(k)));

/** beforeBreadcrumb: فقط ناوبری (با URL بدون query)؛ console/fetch/xhr/کلیک/ورودی حذف می‌شوند (متن عنصر و بدنه ممکن است داده‌ی بیمار باشد). */
export function scrubBreadcrumb<T extends { category?: string; data?: Ev; message?: string }>(b: T): T | null {
  try {
    if (b.category !== "navigation") return null;
    const data: Ev = {};
    if (b.data?.from) data.from = scrubUrl(b.data.from);
    if (b.data?.to) data.to = scrubUrl(b.data.to);
    return { ...b, message: undefined, data };
  } catch {
    return null;
  }
}

/** beforeSend / beforeSendTransaction. null ⇒ رویداد ارسال نمی‌شود. */
export function scrubEvent<T extends Ev>(event: T): T | null {
  try {
    const e: Ev = { ...event };

    // ساختارهای شناسایی‌پذیر: کاملاً حذف
    delete e.user;
    delete e.server_name;
    delete e.modules;
    delete e.debug_meta;
    delete e.sdkProcessingMetadata;

    // request: فقط method + URL بدون query
    const req = rec(e.request);
    if (e.request) e.request = { method: typeof req?.method === "string" ? req.method : undefined, url: scrubUrl(req?.url) };

    if (typeof e.message === "string") e.message = scrubString(e.message);
    const logentry = rec(e.logentry);
    if (e.logentry) e.logentry = { message: typeof logentry?.message === "string" ? scrubString(logentry.message) : undefined };
    if (typeof e.transaction === "string") e.transaction = scrubUrl(e.transaction) ?? e.transaction;

    const exc = rec(e.exception);
    if (exc?.values) {
      e.exception = {
        ...exc,
        values: recs(exc.values).map((v) => {
          const st = rec(v.stacktrace);
          return {
            ...v,
            value: typeof v.value === "string" ? scrubString(v.value) : v.value,
            stacktrace: st ? { ...st, frames: Array.isArray(st.frames) ? recs(st.frames).map((f) => omit(f, FRAME_DROP)) : undefined } : undefined,
          };
        }),
      };
    }

    if (e.breadcrumbs) {
      const bc = rec(e.breadcrumbs);
      const list = Array.isArray(e.breadcrumbs) ? recs(e.breadcrumbs) : recs(bc?.values);
      const kept = list.map((b) => scrubBreadcrumb(b)).filter(Boolean);
      e.breadcrumbs = Array.isArray(e.breadcrumbs) ? kept : { values: kept };
    }

    for (const k of ["extra", "tags", "contexts"]) if (e[k]) e[k] = scrubDeep(e[k] as Json);

    if (Array.isArray(e.spans)) {
      e.spans = recs(e.spans).map((sp) => {
        const isDb = typeof sp.op === "string" && /^db|sql|redis/i.test(sp.op);
        return { ...sp, description: isDb ? "[db]" : typeof sp.description === "string" ? scrubString(sp.description.replace(/[?#].*$/, "")) : sp.description, data: undefined, tags: undefined };
      });
    }
    return e as T;
  } catch {
    return null; // fail-closed
  }
}
