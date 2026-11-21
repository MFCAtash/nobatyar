import { scrubBreadcrumb, scrubEvent } from "@nobatyar/shared";

export interface SentryConfig {
  dsn?: string;
  environment: string;
  release?: string;
  tracesSampleRate: number;
}

/** بدون SENTRY_DSN ⇒ مانیتورینگ خارجی کاملاً خاموش است (هیچ داده‌ای نمی‌رود). */
export function loadSentryConfig(env: NodeJS.ProcessEnv = process.env): SentryConfig {
  const dsn = env.SENTRY_DSN?.trim() || undefined;
  if (dsn && !/^https:\/\/[^@\s]+@[^/\s]+\/\d+$/.test(dsn)) throw new Error("SENTRY_DSN must look like https://<key>@<host>/<project>");
  const rate = env.SENTRY_TRACES_SAMPLE_RATE ? Number(env.SENTRY_TRACES_SAMPLE_RATE) : 0;
  if (!Number.isFinite(rate) || rate < 0 || rate > 0.2) throw new Error("SENTRY_TRACES_SAMPLE_RATE must be in [0, 0.2]");
  return { dsn, environment: env.SENTRY_ENVIRONMENT?.trim() || env.NODE_ENV || "development", release: env.SENTRY_RELEASE?.trim() || undefined, tracesSampleRate: rate };
}

/**
 * گزینه‌های init — «حریم خصوصی اول». هیچ‌کدام از این‌ها بدون تغییر در تست (sentry.test.ts) قابل شل‌شدن نیست.
 *  - sendDefaultPii=false: IP/کوکی/هدر خودکار نمی‌رود.
 *  - beforeSend / beforeSendTransaction: scrubEvent (حذف بدنه‌ی درخواست و هر فیلد پزشکی/هویتی؛ خطا ⇒ دور ریختن).
 *  - beforeBreadcrumb: فقط ناوبری؛ بدنه‌ی fetch/console/… هرگز.
 */
export function buildSentryOptions(cfg: SentryConfig) {
  return {
    dsn: cfg.dsn,
    environment: cfg.environment,
    release: cfg.release,
    tracesSampleRate: cfg.tracesSampleRate,
    sendDefaultPii: false,
    maxBreadcrumbs: 20,
    maxValueLength: 300,
    normalizeDepth: 3,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}
