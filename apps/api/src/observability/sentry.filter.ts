import { ArgumentsHost, Catch } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import { captureException } from "./sentry";

/** خطاهای ۵xx/غیرمنتظره را (پس از scrub) گزارش می‌کند و پاسخ را به رفتار پیش‌فرض Nest می‌سپارد. */
@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    captureException(exception);
    super.catch(exception, host);
  }
}
