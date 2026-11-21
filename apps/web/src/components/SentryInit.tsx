"use client";
import { useEffect } from "react";
import { scrubBreadcrumb, scrubEvent } from "@nobatyar/shared";

/**
 * Sentry مرورگر — فقط با NEXT_PUBLIC_SENTRY_DSN (زمان build). حریم خصوصی اول:
 *  بدنه‌ی درخواست/کوکی/هدر/کاربر/query حذف، breadcrumb ی غیر ناوبری حذف، replay و session tracking خاموش،
 *  هر خطا در پاک‌سازی ⇒ رویداد دور ریخته می‌شود (scrubEvent در packages/shared).
 */
export function SentryInit() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;
    void import("@sentry/browser").then((S) => {
      S.init({
        dsn,
        environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "production",
        sendDefaultPii: false,
        tracesSampleRate: 0,
        maxBreadcrumbs: 20,
        maxValueLength: 300,
        normalizeDepth: 3,
        beforeSend: (e) => scrubEvent(e as never) as typeof e | null,
        beforeBreadcrumb: (b) => scrubBreadcrumb(b as never) as typeof b | null,
        // فقط خطاهای واقعی برنامه؛ نه خطای افزونه‌های مرورگر
        denyUrls: [/^chrome-extension:\/\//i, /^moz-extension:\/\//i, /^safari-extension:\/\//i],
      });
    });
  }, []);
  return null;
}
