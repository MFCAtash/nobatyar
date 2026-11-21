import { describe, expect, it } from "vitest";
// فایل UMD ی عمومی (public/sw-policy.js) توسط allowJs تایپ میشود.
import policy from "../../public/sw-policy.js";

const O = "https://nobatyar.ir";
const req = (path: string, over: Record<string, string> = {}) => ({ method: "GET", url: `${O}${path}`, mode: "cors", ...over });

describe("sw-policy.classify — فقط استاتیک", () => {
  it("فایل‌های استاتیک allowlist ⇒ static", () => {
    for (const p of ["/_next/static/chunks/main.js", "/_next/static/media/vazir.woff2", "/icons/icon-192.png", "/manifest.webmanifest", "/offline.html"]) {
      expect(policy.classify(req(p), O)).toBe("static");
    }
  });
  it("هر مسیر API/سوکت/callback پرداخت ⇒ bypass (هرگز cache نمی‌شود)", () => {
    for (const p of ["/api/v1/appointments", "/api/v1/me", "/api/v1/notifications/stream", "/socket.io/?EIO=4", "/payment/callback?appointmentId=1&Authority=A", "/__e2e/otp"]) {
      expect(policy.classify(req(p), O)).toBe("bypass");
    }
  });
  it("حتی مسیر استاتیکِ زیر /api ⇒ bypass", () => {
    expect(policy.classify(req("/api/v1/_next/static/x.js"), O)).toBe("bypass");
  });
  it("روش غیر GET و مبدأ دیگر ⇒ bypass", () => {
    expect(policy.classify(req("/_next/static/a.js", { method: "POST" }), O)).toBe("bypass");
    expect(policy.classify({ method: "GET", url: "https://evil.example/_next/static/a.js", mode: "cors" }, O)).toBe("bypass");
  });
  it("ناوبری ⇒ navigate (فقط شبکه) و داده‌های دیگر ⇒ bypass", () => {
    expect(policy.classify(req("/appointments/abc", { mode: "navigate" }), O)).toBe("navigate");
    expect(policy.classify(req("/records"), O)).toBe("bypass");
    expect(policy.classify(req("/api/v1/x", { mode: "navigate" }), O)).toBe("bypass");
  });
});

describe("sw-policy.shouldCache", () => {
  it("فقط ۲۰۰ ی basic بدون no-store/private", () => {
    expect(policy.shouldCache(200, "basic", "public, max-age=31536000")).toBe(true);
    expect(policy.shouldCache(200, "basic", "")).toBe(true);
    expect(policy.shouldCache(200, "basic", "private, max-age=0")).toBe(false);
    expect(policy.shouldCache(200, "basic", "no-store")).toBe(false);
    expect(policy.shouldCache(404, "basic", "")).toBe(false);
    expect(policy.shouldCache(200, "opaque", "")).toBe(false);
  });
});

describe("sw-policy.safeUrl / parsePush", () => {
  it("فقط مسیر نسبی امن", () => {
    expect(policy.safeUrl("/appointments/3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBe("/appointments/3f2504e0-4f89-11d3-9a0c-0305e82c3301");
    for (const bad of ["https://evil.example", "//evil.example", "javascript:alert(1)", "/a?x=1", "", undefined, 5]) expect(policy.safeUrl(bad)).toBe("/");
  });
  it("پیلود خراب ⇒ اعلان عمومی؛ طول محدود", () => {
    expect(policy.parsePush("not json")).toEqual({ title: "نوبت‌یار", body: "اعلان جدید دارید.", url: "/", tag: "nvy" });
    const p = policy.parsePush(JSON.stringify({ title: "x".repeat(500), body: "b", url: "https://evil.example", tag: "t" }));
    expect(p.title).toHaveLength(60);
    expect(p.url).toBe("/");
  });
});
