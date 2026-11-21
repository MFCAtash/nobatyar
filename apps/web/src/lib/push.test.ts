import { describe, expect, it } from "vitest";
import { pushSupport, urlBase64ToUint8Array } from "./push";

describe("urlBase64ToUint8Array", () => {
  it("base64url بدون padding را درست رمزگشایی می‌کند", () => {
    expect(Array.from(urlBase64ToUint8Array("AQID"))).toEqual([1, 2, 3]);
    expect(Array.from(urlBase64ToUint8Array("-_8"))).toEqual([251, 255]);
  });
  it("کلید ۸۷ نویسه‌ای ⇒ ۶۵ بایت", () => {
    expect(urlBase64ToUint8Array("B".repeat(87))).toHaveLength(65);
  });
});

describe("pushSupport", () => {
  const all = { hasSW: true, hasPush: true, hasNotification: true };
  it("پشتیبانی/رد مجوز/ناپشتیبان", () => {
    expect(pushSupport({ ...all, permission: "default" })).toBe("available");
    expect(pushSupport({ ...all, permission: "granted" })).toBe("available");
    expect(pushSupport({ ...all, permission: "denied" })).toBe("denied");
    expect(pushSupport({ ...all, hasPush: false })).toBe("unsupported");
    expect(pushSupport({ ...all, hasSW: false })).toBe("unsupported");
  });
});
