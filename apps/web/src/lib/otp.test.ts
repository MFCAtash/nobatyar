import { describe, expect, it } from "vitest";
import { extractOtp, isCompleteOtp, normalizeOtp, resendSeconds } from "./otp";

describe("otp helpers", () => {
  it("normalizes Persian/Arabic digits and junk", () => {
    expect(normalizeOtp("۱۲۳ ٤٥٦")).toBe("123456");
    expect(normalizeOtp("12-34-56-78-90")).toBe("12345678");
  });
  it("detects completeness at the configured length", () => {
    expect(isCompleteOtp("123456")).toBe(true);
    expect(isCompleteOtp("12345")).toBe(false);
    expect(isCompleteOtp("1234567", 7)).toBe(true);
  });
  it("extracts the code from an sms", () => {
    expect(extractOtp("کد ورود نوبت‌یار: ۴۸۲۹۱۰\n@nobatyar.ir #482910")).toBe("482910");
    expect(extractOtp("بدون کد")).toBeNull();
    expect(extractOtp("شماره 09121234567")).toBeNull();
  });
  it("resend seconds", () => {
    expect(resendSeconds(undefined)).toBe(60);
    expect(resendSeconds(12.2)).toBe(13);
  });
});
