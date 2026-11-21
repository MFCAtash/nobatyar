import { loadAuthConfig } from "./auth.config";
import { loadSseConfig } from "../notifications/sse-config";
import { loadOpsConfig } from "../observability/ops.config";
import { loadSentryConfig } from "../observability/sentry.config";
import { loadPaymentConfig } from "../payment/payment.config";
import { loadPushConfig } from "../push/push.config";
import { loadSchedulingConfig } from "../scheduling/config";
import { loadStorageConfig } from "../storage/storage.config";
import { loadVideoConfig } from "../video/video.config";

export interface PreflightResult { errors: string[]; warnings: string[]; info: string[] }

type Env = Record<string, string | undefined>;

const PLACEHOLDER = /^(change-?me|changeme|todo|xxx+|your[-_ ].*|example)/i;
const REQUIRED = [
  "DOMAIN", "LIVEKIT_DOMAIN", "ACME_EMAIL", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB", "APP_DB_USER", "APP_DB_PASSWORD",
  "REDIS_PASSWORD", "FIELD_KEYS", "FIELD_KEY_ACTIVE", "BLIND_INDEX_KEY", "JWT_ACCESS_SECRET", "OTP_SECRET",
  "SMS_PROVIDER", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "PAYMENT_GATEWAY",
  "STORAGE_DOMAIN", "MINIO_ROOT_USER", "MINIO_ROOT_PASSWORD", "MINIO_APP_USER", "MINIO_APP_PASSWORD",
] as const;
/** این‌ها داخل connection string می‌آیند ⇒ فقط URL-safe. */
const URL_SAFE_SECRETS = ["POSTGRES_PASSWORD", "APP_DB_PASSWORD", "REDIS_PASSWORD", "MINIO_ROOT_PASSWORD", "MINIO_APP_PASSWORD"] as const;

/** متغیرهای API دقیقاً همان‌طور که docker-compose.prod.yml از روی فایل env می‌سازد. */
export function deriveApiEnv(f: Env): Env {
  const d = f.DOMAIN ?? "";
  return {
    ...f, NODE_ENV: "production",
    CORS_ORIGINS: `https://${d}`, WEB_ORIGIN: `https://${d}`, ALLOWED_CALLBACK_ORIGINS: `https://${d}`,
    COOKIE_SECURE: "true", TRUST_PROXY_HOPS: "1",
    LIVEKIT_URL: f.LIVEKIT_DOMAIN ? `wss://${f.LIVEKIT_DOMAIN}` : undefined,
    // ذخیره‌ساز: دقیقاً همان‌طور که docker-compose.prod.yml (x-api-env) می‌سازد
    MINIO_ENDPOINT: "http://minio:9000",
    MINIO_PUBLIC_ENDPOINT: f.STORAGE_DOMAIN ? `https://${f.STORAGE_DOMAIN}` : undefined,
    MINIO_ACCESS_KEY: f.MINIO_APP_USER, MINIO_SECRET_KEY: f.MINIO_APP_PASSWORD,
    MINIO_BUCKET: f.MINIO_BUCKET || "nobatyar-private",
  };
}

/**
 * بررسی «پیش از استقرار» فایل .env.production: جانشین‌های فراموش‌شده، رمزهای ضعیف/ناسازگار،
 * و اجرای «همان loader های fail-closed ی اپ» روی تنظیمات مشتق‌شده. هیچ مقداری چاپ نمی‌شود (فقط نام کلید).
 */
export function runPreflight(f: Env): PreflightResult {
  const errors: string[] = [], warnings: string[] = [], info: string[] = [];

  for (const k of REQUIRED) {
    const v = f[k]?.trim();
    if (!v) errors.push(`${k}: تنظیم نشده`);
    else if (PLACEHOLDER.test(v)) errors.push(`${k}: هنوز مقدار نمونه (placeholder) است`);
  }
  const domain = f.DOMAIN?.trim() ?? "";
  if (domain && (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(domain) || /^(localhost|example\.)/i.test(domain) || domain.endsWith(".example.ir"))) {
    errors.push("DOMAIN: باید دامنه‌ی واقعی بدون scheme/مسیر باشد (نه localhost/example)");
  }
  if (f.LIVEKIT_DOMAIN && f.LIVEKIT_DOMAIN === f.DOMAIN) errors.push("LIVEKIT_DOMAIN: باید با DOMAIN متفاوت باشد");
  const sd = f.STORAGE_DOMAIN?.trim() ?? "";
  if (sd && (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(sd) || /^(localhost|example\.)/i.test(sd) || sd.endsWith(".example.ir"))) {
    errors.push("STORAGE_DOMAIN: باید دامنه‌ی واقعی بدون scheme/مسیر باشد (مثلاً s3.your-domain.ir)");
  }
  if (sd && (sd === f.DOMAIN || sd === f.LIVEKIT_DOMAIN)) errors.push("STORAGE_DOMAIN: باید با DOMAIN و LIVEKIT_DOMAIN متفاوت باشد");

  for (const k of URL_SAFE_SECRETS) {
    const v = f[k] ?? "";
    if (v && !PLACEHOLDER.test(v)) {
      if (!/^[A-Za-z0-9_-]+$/.test(v)) errors.push(`${k}: فقط [A-Za-z0-9_-] (داخل connection string می‌آید؛ openssl rand -hex 24)`);
      else if (v.length < 20) errors.push(`${k}: کوتاه است (حداقل ۲۰ نویسه)`);
    }
  }
  if (f.POSTGRES_PASSWORD && f.POSTGRES_PASSWORD === f.APP_DB_PASSWORD) errors.push("APP_DB_PASSWORD: نباید با POSTGRES_PASSWORD یکی باشد");
  if (f.POSTGRES_USER && f.POSTGRES_USER === f.APP_DB_USER) errors.push("APP_DB_USER: نقش اپ باید غیر از مالک (POSTGRES_USER) باشد، وگرنه RLS دور زده می‌شود");

  // کلیدهای رمزنگاری
  const b64len = (s: string) => Buffer.from(s, "base64").length;
  if (f.FIELD_KEYS && !PLACEHOLDER.test(f.FIELD_KEYS)) {
    const ids = new Set<number>();
    for (const part of f.FIELD_KEYS.split(",")) {
      const m = /^(\d{1,5}):([A-Za-z0-9+/=]+)$/.exec(part.trim());
      if (!m || b64len(m[2]!) !== 32) errors.push("FIELD_KEYS: هر عضو باید «id:base64(۳۲ بایت)» باشد (gen:keys)");
      else ids.add(Number(m[1]));
    }
    if (f.FIELD_KEY_ACTIVE && !ids.has(Number(f.FIELD_KEY_ACTIVE))) errors.push("FIELD_KEY_ACTIVE: در FIELD_KEYS وجود ندارد");
  }
  if (f.BLIND_INDEX_KEY && !PLACEHOLDER.test(f.BLIND_INDEX_KEY) && b64len(f.BLIND_INDEX_KEY) < 32) errors.push("BLIND_INDEX_KEY: حداقل ۳۲ بایت base64");
  if (f.MINIO_ROOT_USER && f.MINIO_ROOT_USER === f.MINIO_APP_USER) errors.push("MINIO_APP_USER: باید غیر از MINIO_ROOT_USER باشد (API فقط کاربر محدود به همین bucket را می‌بیند)");
  if (f.MINIO_ROOT_PASSWORD && f.MINIO_ROOT_PASSWORD === f.MINIO_APP_PASSWORD) errors.push("MINIO_APP_PASSWORD: نباید با MINIO_ROOT_PASSWORD یکی باشد");
  const distinct = ["JWT_ACCESS_SECRET", "OTP_SECRET", "BLIND_INDEX_KEY"].map((k) => f[k]).filter(Boolean);
  if (new Set(distinct).size !== distinct.length) errors.push("JWT_ACCESS_SECRET / OTP_SECRET / BLIND_INDEX_KEY باید مستقل (متفاوت) باشند");

  if (f.SMS_PROVIDER && f.SMS_PROVIDER !== "kavenegar") errors.push("SMS_PROVIDER: در production فقط kavenegar");
  for (const k of ["E2E_TEST_HOOKS"]) if (f[k] === "true") errors.push(`${k}=true در production ممنوع`);

  // loader های fail-closed خودِ اپ، روی تنظیمات مشتق‌شده
  const env = deriveApiEnv(f) as NodeJS.ProcessEnv;
  const loaders: [string, (e: NodeJS.ProcessEnv) => unknown][] = [
    ["auth", loadAuthConfig], ["payment", loadPaymentConfig], ["scheduling", loadSchedulingConfig], ["sse", loadSseConfig as never],
    ["video", loadVideoConfig], ["storage", loadStorageConfig], ["sentry", loadSentryConfig], ["push", loadPushConfig], ["ops", loadOpsConfig],
  ];
  for (const [name, fn] of loaders) {
    try { fn(env); } catch (e) { errors.push(`${name}: ${(e as Error).message}`); }
  }

  // هشدارها (مانع استقرار نیستند)
  if (!f.IMAGE_TAG || f.IMAGE_TAG === "local") warnings.push("IMAGE_TAG=local: برای بازگشت (rollback) از تگ نسخه‌دار (git sha) استفاده کنید");
  if (!f.METRICS_TOKEN) warnings.push("METRICS_TOKEN تنظیم نشده: /metrics خاموش است (پایش Prometheus کار نمی‌کند)");
  if (!f.SENTRY_DSN) warnings.push("SENTRY_DSN خالی: گزارش خطای خودکار خاموش است");
  if (!f.ZARINPAL_ACCESS_TOKEN && (f.PAYMENT_GATEWAY === "zarinpal" || f.PAYMENT_FALLBACK_GATEWAYS?.includes("zarinpal"))) warnings.push("ZARINPAL_ACCESS_TOKEN خالی: استردادها «دستی» می‌شوند");
  if (f.ADMIN_REQUIRE_MFA !== "true") warnings.push("ADMIN_REQUIRE_MFA!=true: ادمینها ملزم به TOTP نیستند (پس از ثبت راز حداقل ۲ ادمین فعال کنید)");
  if (!f.BACKUP_AGE_RECIPIENT) warnings.push("BACKUP_AGE_RECIPIENT خالی: پشتیبان رمزنگاری‌شده‌ی خودکار پیکربندی نشده (scripts/backup-db.sh)");
  if (!f.VAPID_PUBLIC_KEY) info.push("Web Push خاموش است (VAPID_*)");
  if (!f.NEXT_PUBLIC_SENTRY_DSN && f.SENTRY_DSN) warnings.push("SENTRY_DSN هست ولی NEXT_PUBLIC_SENTRY_DSN نه: خطاهای مرورگر گزارش نمی‌شود");

  return { errors, warnings, info };
}

/** تجزیه‌ی ساده‌ی .env (KEY=VALUE، کامنت #، نقل‌قول اختیاری). */
export function parseDotenv(text: string): Env {
  const out: Env = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2]!;
    // P2: ابتدا کامنت انتهایی را جدا میکنیم، سپس نقلقول را برمیداریم (الگوی غیرحریص). ترتیب معکوس
    // موجب میشد `A="x" # "y"` به اشتباه `[x" # "y]` خوانده شود.
    const q = /^(['"])(.*?)\1\s*(?:#.*)?$/.exec(v);
    if (q) v = q[2]!;
    else v = v.replace(/\s+#.*$/, "");
    out[m[1]!] = v;
  }
  return out;
}
