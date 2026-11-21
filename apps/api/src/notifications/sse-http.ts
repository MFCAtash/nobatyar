/**
 * چسب HTTP برای SSE — بدون وابستگی به Nest (فقط تایپ Express)، تا با سرور HTTP خام هم قابل‌تست باشد.
 */
import type { Request, Response } from "express";
import type { SseSink } from "./sse-session";

/** Express ‎Response ← SseSink */
export function responseSink(res: Pick<Response, "write" | "end" | "writableLength" | "on">): SseSink {
  return {
    write: (chunk) => res.write(chunk),
    end: () => void res.end(),
    backlogBytes: () => res.writableLength,
    onClose: (cb) => void res.on("close", cb),
  };
}

/** هدرهای یک پاسخ SSE سالم پشت proxy. */
export function applySseHeaders(res: Pick<Response, "status" | "setHeader" | "flushHeaders">): void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  // no-transform: میان‌افزارهای فشرده‌سازی (مثل compression ی Next در dev) جریان را بافر نکنند.
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // nginx: بافر «همین پاسخ» را خاموش کن (در کنار proxy_buffering off در تنظیمات proxy).
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
}

/** Last-Event-ID: هدر استاندارد (EventSource و کلاینت ما)، یا query ی lastEventId برای کلاینت‌هایی که هدر نمی‌توانند. */
export function lastEventIdOf(req: Pick<Request, "headers" | "query">): string | undefined {
  const h = req.headers["last-event-id"];
  const fromHeader = Array.isArray(h) ? h[0] : h;
  const q = req.query?.lastEventId;
  const fromQuery = typeof q === "string" ? q : undefined;
  const v = (fromHeader ?? fromQuery)?.trim();
  return v ? v.slice(0, 64) : undefined;
}
