import { describe, expect, it, vi } from "vitest";

/**
 * تست واحد مستقل از SDK: یک tracer ساده در حافظه جایگزین @opentelemetry/api میشود.
 * (پیش از این تست به export ی «recorded» ی غیرموجود در API بستگی داشت.)
 */
const { recorded } = vi.hoisted(() => ({ recorded: [] as {
  name: string; attributes: Record<string, unknown>; status: unknown; ended: number;
}[] }));

vi.mock("@opentelemetry/api", () => ({
  SpanStatusCode: { UNSET: 0, OK: 1, ERROR: 2 },
  trace: {
    getTracer: () => ({
      startActiveSpan: (name: string, opts: { attributes?: Record<string, unknown> }, fn: (span: unknown) => unknown) => {
        const span = {
          name,
          attributes: { ...(opts?.attributes ?? {}) } as Record<string, unknown>,
          status: null as unknown,
          ended: 0,
          setAttributes(a: Record<string, unknown>) { Object.assign(this.attributes, a); },
          setAttribute(k: string, v: unknown) { this.attributes[k] = v; },
          setStatus(s: unknown) { this.status = s; },
          end() { this.ended++; },
        };
        recorded.push(span);
        return fn(span);
      },
    }),
  },
}));

import { ALLOWED_ATTRIBUTES, safeAttributes, scrubSpan, scrubSpanAttributes, scrubSpanName, setSpanAttributes, withSpan } from "./tracing";

describe("safeAttributes", () => {
  it("فقط کلیدهای مجاز و مقادیر ساده", () => {
    const a = safeAttributes({ "appointment.kind": "VIDEO", "payment.gateway": "zarinpal", phone: "09121234567", "user.name": "علی", "outbox.claimed": 3, "refund.id": undefined, "payment.state": null });
    expect(a).toEqual({ "appointment.kind": "VIDEO", "payment.gateway": "zarinpal", "outbox.claimed": 3 });
  });
  it("مقدار رشته scrub و کوتاه می‌شود", () => {
    const a = safeAttributes({ "payment.outcome": "ok 09121234567 " + "x".repeat(300) });
    expect(String(a["payment.outcome"]).length).toBeLessThanOrEqual(128);
    expect(String(a["payment.outcome"])).not.toContain("09121234567");
  });
  it("فهرست مجاز شامل هیچ کلید شخصی نیست", () => {
    for (const k of ALLOWED_ATTRIBUTES) expect(k).not.toMatch(/phone|name|email|reason|diagnos|body|message|national/i);
  });
});

describe("withSpan", () => {
  it("span را می‌سازد، attribute ها را فیلتر می‌کند و پایان می‌دهد", async () => {
    recorded.length = 0;
    const r = await withSpan("booking.create", { "appointment.kind": "VIDEO", reason: "سردرد" }, async (span) => { setSpanAttributes(span, { "appointment.id": "a1", note: "x" }); return 7; });
    expect(r).toBe(7);
    const s = recorded[0] as { name: string; attributes: Record<string, unknown>; ended: number; status: unknown };
    expect(s.name).toBe("booking.create");
    expect(s.attributes).toEqual({ "appointment.kind": "VIDEO", "appointment.id": "a1" });
    expect(s.ended).toBe(1);
    expect(s.status).toBeNull();
  });
  it("خطا: فقط نوع ثبت می‌شود (نه پیام)، span بسته و خطا دوباره پرتاب می‌شود", async () => {
    recorded.length = 0;
    await expect(withSpan("payment.settle", {}, async () => { throw new TypeError("کد ملی 0012345678 نامعتبر"); })).rejects.toBeInstanceOf(TypeError);
    const s = recorded[0] as { attributes: Record<string, unknown>; ended: number; status: { code: number } };
    expect(s.attributes["error.type"]).toBe("TypeError");
    expect(JSON.stringify(s.attributes)).not.toContain("0012345678");
    expect(s.status.code).toBe(2);
    expect(s.ended).toBe(1);
  });
});

describe("scrubSpanAttributes (span های خودکار)", () => {
  it("URL بدون query/hash؛ SQL پنهان؛ هدرها و IP حذف", () => {
    const a: Record<string, unknown> = {
      "http.url": "https://api.nobatyar.ir/api/v1/appointments?patient=09121234567&token=abc#frag",
      "http.target": "/api/v1/records?q=سرطان",
      "url.query": "q=secret",
      "db.statement": "SELECT * FROM users WHERE phone = '0912'",
      "http.request.header.authorization": "Bearer xyz",
      "http.user_agent": "Mozilla/5.0",
      "net.peer.ip": "1.2.3.4", "client.address": "1.2.3.4",
      "http.method": "GET", "http.status_code": 200,
    };
    scrubSpanAttributes(a);
    expect(a["http.url"]).toBe("https://api.nobatyar.ir/api/v1/appointments");
    expect(a["http.target"]).toBe("/api/v1/records");
    expect(a["db.statement"]).toBe("[db]");
    for (const k of ["url.query", "http.request.header.authorization", "http.user_agent", "net.peer.ip", "client.address"]) expect(k in a).toBe(false);
    expect(a["http.method"]).toBe("GET");
    expect(a["http.status_code"]).toBe(200);
  });
  it("رویداد exception متن و stack ندارد؛ نام span از query پاک می‌شود", () => {
    const s = { name: "GET /api/v1/x?phone=0912", attributes: {}, events: [{ name: "exception", attributes: { "exception.type": "Error", "exception.message": "علی رضایی", "exception.stacktrace": "at x" } }] };
    scrubSpan(s);
    expect(s.name).toBe("GET /api/v1/x");
    expect(s.events[0]!.attributes).toEqual({ "exception.type": "Error" });
    expect(scrubSpanName("prisma:engine:db_query")).toBe("prisma:engine:db_query");
  });
});
