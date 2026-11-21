/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { HttpException } from "@nestjs/common";
import { buildSentryOptions, loadSentryConfig } from "./sentry.config";
import { shouldReport } from "./sentry";

describe("loadSentryConfig", () => {
  it("بدون DSN خاموش", () => expect(loadSentryConfig({} as any).dsn).toBeUndefined());
  it("DSN نامعتبر یا نرخ بالای ۰٫۲ ⇒ خطا", () => {
    expect(() => loadSentryConfig({ SENTRY_DSN: "http://k@h/1" } as any)).toThrow(/SENTRY_DSN/);
    expect(() => loadSentryConfig({ SENTRY_TRACES_SAMPLE_RATE: "1" } as any)).toThrow(/SAMPLE_RATE/);
    expect(loadSentryConfig({ SENTRY_DSN: "https://abc@o1.ingest.sentry.io/123" } as any).dsn).toContain("sentry.io");
  });
});

describe("buildSentryOptions — حریم خصوصی", () => {
  const o: any = buildSentryOptions({ dsn: "https://k@h/1", environment: "t", tracesSampleRate: 0 });
  it("PII پیش‌فرض خاموش و هر سه hook پاک‌ساز نصب است", () => {
    expect(o.sendDefaultPii).toBe(false);
    expect(typeof o.beforeSend).toBe("function");
    expect(o.beforeSendTransaction).toBe(o.beforeSend);
    expect(typeof o.beforeBreadcrumb).toBe("function");
  });
  it("beforeSend بدنه‌ی درخواست و فیلدهای پزشکی را حذف می‌کند", () => {
    const ev = o.beforeSend({ request: { method: "POST", url: "https://x.ir/api/v1/appointments?x=1", data: { reason: "سردرد", phone: "09121234567" } }, extra: { diagnosis: "x" }, user: { id: "u" } });
    const s = JSON.stringify(ev);
    expect(s.includes("سردرد") || s.includes("09121234567") || s.includes("diagnosis\":\"x")).toBe(false);
    expect(ev.user).toBeUndefined();
  });
});

describe("shouldReport", () => {
  it("۴xx گزارش نمی‌شود؛ ۵xx و خطای ناشناخته می‌شود", () => {
    expect(shouldReport(new HttpException("x", 409))).toBe(false);
    expect(shouldReport(new HttpException("x", 503))).toBe(true);
    expect(shouldReport(new Error("boom"))).toBe(true);
  });
});
