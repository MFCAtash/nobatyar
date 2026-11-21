/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { FILTERED, isSensitiveKey, scrubBreadcrumb, scrubDeep, scrubEvent, scrubString, scrubUrl } from "./scrub";

describe("isSensitiveKey", () => {
  it("کلیدهای پزشکی/هویتی/رازی حساس‌اند", () => {
    for (const k of ["reason", "reasonForVisit", "soapNote", "diagnosis", "icdCode", "prescription", "medications", "allergies", "chronicConditions",
      "phone", "mobile", "nationalCode", "email", "fullName", "password", "otp", "accessToken", "authorization", "cookie", "authority", "cardPan", "body", "message", "ip", "x_ip"]) {
      expect(isSensitiveKey(k)).toBe(true);
    }
  });
  it("کلیدهای عملیاتی امن‌اند", () => {
    for (const k of ["status", "statusCode", "method", "type", "level", "op", "trace_id", "description", "route"]) expect(isSensitiveKey(k)).toBe(false);
  });
});

describe("scrubString", () => {
  it("JWT، Bearer، موبایل (انگلیسی/فارسی/+98)، ایمیل، کد ملی، hex/secret", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop";
    expect(scrubString(`t=${jwt}`)).toBe("t=[jwt]");
    expect(scrubString("Authorization: Bearer abcdefghij1234567890")).toContain("Bearer [token]");
    expect(scrubString("call 09121234567 now")).toBe("call [phone] now");
    expect(scrubString("call ۰۹۱۲۱۲۳۴۵۶۷ now")).toBe("call [phone] now");
    expect(scrubString("+989121234567")).toBe("[phone]");
    expect(scrubString("a.b@example.ir failed")).toBe("[email] failed");
    expect(scrubString("کد ملی 0012345678 نامعتبر")).toContain("[id-number]");
    expect(scrubString("key=" + "a".repeat(40))).not.toContain("a".repeat(40));
  });
  it("UUID ها (شناسه‌ی شبه‌ناشناس) دست‌نخورده می‌مانند", () => {
    const u = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    expect(scrubString(`appointment ${u}`)).toContain(u);
  });
});

describe("scrubUrl", () => {
  it("query و hash حذف می‌شوند", () => {
    expect(scrubUrl("https://x.ir/payment/callback?appointmentId=1&Authority=A0000&Status=OK#x")).toBe("https://x.ir/payment/callback");
    expect(scrubUrl(undefined)).toBeUndefined();
  });
});

describe("scrubDeep", () => {
  it("کلید حساس ⇒ Filtered؛ رشته‌ها پاک؛ عمق محدود", () => {
    const r = scrubDeep({ a: { reason: "سردرد شدید", ok: "x 09121234567" }, list: [{ diagnosis: "d" }] }) as any;
    expect(r.a.reason).toBe(FILTERED);
    expect(r.a.ok).toBe("x [phone]");
    expect(r.list[0].diagnosis).toBe(FILTERED);
  });
});

describe("scrubBreadcrumb", () => {
  it("فقط navigation نگه داشته می‌شود", () => {
    for (const c of ["console", "fetch", "xhr", "ui.click", "ui.input", "http"]) expect(scrubBreadcrumb({ category: c, data: { url: "/api/v1/x?phone=0912" } })).toBeNull();
    expect(scrubBreadcrumb({ category: "navigation", data: { from: "/a?x=1", to: "/appointments/1?token=t" } })).toEqual({ category: "navigation", message: undefined, data: { from: "/a", to: "/appointments/1" } });
  });
});

describe("scrubEvent — هیچ داده‌ی بیمار نباید از رویداد خارج شود", () => {
  const dirty = () => ({
    event_id: "abc", level: "error", server_name: "host1",
    user: { id: "u1", email: "p@x.ir", ip_address: "1.2.3.4" },
    request: {
      method: "POST", url: "https://x.ir/api/v1/appointments?token=SECRET",
      data: { reason: "درد قفسه سینه", doctorId: "d" }, cookies: { rt: "r" }, headers: { authorization: "Bearer abcdefghijkl", cookie: "rt=1" }, query_string: "phone=0912",
    },
    message: "failed for 09121234567",
    exception: { values: [{ type: "Error", value: "bad phone 09121234567", stacktrace: { frames: [{ filename: "a.ts", vars: { password: "p" }, context_line: "const reason = x" }] } }] },
    breadcrumbs: [{ category: "fetch", data: { url: "/api/v1/me" } }, { category: "navigation", data: { to: "/x?y=1" } }],
    extra: { soap: { assessment: "x" }, note: "n", retry: 2 },
    tags: { route: "/appointments", phone: "0912" },
    contexts: { app: { name: "x" } },
    spans: [{ op: "db.sql", description: "SELECT * FROM users WHERE phone='0912'", data: { a: 1 } }, { op: "http.client", description: "GET https://s.io/a?k=v" }],
    transaction: "GET /api/v1/doctors?q=علی",
  });

  it("خروجی هیچ‌کدام از مقادیر حساس را ندارد", () => {
    const out = JSON.stringify(scrubEvent(dirty()));
    for (const leak of ["درد قفسه سینه", "p@x.ir", "1.2.3.4", "SECRET", "09121234567", "0912", "Bearer abcdefghijkl", "rt=1", "const reason", "SELECT", "k=v", "علی", "host1"]) {
      expect(out.includes(leak)).toBe(false);
    }
  });

  it("ساختار عملیاتی می‌ماند", () => {
    const o = scrubEvent(dirty()) as any;
    expect(o.request).toEqual({ method: "POST", url: "https://x.ir/api/v1/appointments" });
    expect(o.user).toBeUndefined();
    expect(o.exception.values[0].type).toBe("Error");
    expect(o.exception.values[0].stacktrace.frames[0].filename).toBe("a.ts");
    expect(o.breadcrumbs).toHaveLength(1);
    expect(o.extra.retry).toBe(2);
    expect(o.spans[0].description).toBe("[db]");
    expect(o.level).toBe("error");
  });

  it("fail-closed: ورودی غیرعادی که پاک‌سازی را می‌شکند ⇒ null", () => {
    const evil: any = {};
    Object.defineProperty(evil, "request", { get() { throw new Error("boom"); }, enumerable: true });
    expect(scrubEvent(evil)).toBeNull();
  });
});
