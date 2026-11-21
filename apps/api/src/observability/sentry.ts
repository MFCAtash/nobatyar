import { HttpException } from "@nestjs/common";
import { buildSentryOptions } from "./sentry.config";
import type { SentryConfig } from "./sentry.config";

let sentry: { captureException(e: unknown): void } | null = null;

/** فقط خطاهای «غیرمنتظره» گزارش می‌شوند؛ ۴xx یعنی خطای کلاینت و نباید به سرویس خارجی برود. */
export function shouldReport(e: unknown): boolean {
  if (e instanceof HttpException) return e.getStatus() >= 500;
  const name = (e as { constructor?: { name?: string } })?.constructor?.name;
  return name !== "WsException";
}

export async function initSentry(cfg: SentryConfig): Promise<boolean> {
  if (!cfg.dsn) return false;
  const mod = await import("@sentry/node");
  // نسخه‌های مختلف @sentry/node تعریف beforeSend متفاوتی دارند؛ options توسط buildSentryOptions اعتبارسنجی می‌شود.
  mod.init(buildSentryOptions(cfg) as Parameters<typeof mod.init>[0]);
  sentry = mod;
  return true;
}

export function captureException(e: unknown): void {
  if (sentry && shouldReport(e)) sentry.captureException(e);
}
