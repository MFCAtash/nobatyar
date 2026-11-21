import { describe, expect, it } from "vitest";
import { isOwnRecordObjectKey, resolveShareExpiry } from "./records-policy";

const U = "11111111-1111-4111-8111-111111111111", V = "22222222-2222-4222-8222-222222222222";
const K = "33333333-3333-4333-8333-333333333333";
describe("isOwnRecordObjectKey", () => {
  it("فقط کلید خود کاربر", () => {
    expect(isOwnRecordObjectKey(U, `records/${U}/${K}.pdf`)).toBe(true);
    expect(isOwnRecordObjectKey(U, `records/${V}/${K}.pdf`)).toBe(false);
    expect(isOwnRecordObjectKey(U, `chat/${U}/${K}.pdf`)).toBe(false);
    expect(isOwnRecordObjectKey(U, `records/${U}/../${V}/${K}.pdf`)).toBe(false);
    expect(isOwnRecordObjectKey(U, `records/${U}/${K}.pdf/extra`)).toBe(false);
    expect(isOwnRecordObjectKey("x", `records/x/${K}.pdf`)).toBe(false);
  });
});
describe("resolveShareExpiry", () => {
  const now = new Date("2026-10-20T00:00:00Z");
  it("پیش‌فرض ۳۰ روز؛ گذشته و بیش از ۳۶۵ روز رد", () => {
    const r = resolveShareExpiry(now);
    expect(r.ok && r.expiresAt.toISOString()).toBe("2026-11-19T00:00:00.000Z");
    expect(resolveShareExpiry(now, new Date("2026-10-19T00:00:00Z"))).toEqual({ ok: false, error: "expiry_in_past" });
    expect(resolveShareExpiry(now, new Date("2028-01-01T00:00:00Z"))).toEqual({ ok: false, error: "expiry_too_far" });
  });
});
