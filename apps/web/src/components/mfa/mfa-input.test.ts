import { describe, expect, it } from "vitest";
import { normalizeMfaInput } from "./mfa-input";

describe("ورودی چالش MFA", () => {
  it("TOTP شش رقمی را تشخیص میدهد", () => {
    expect(normalizeMfaInput("123456")).toEqual({ kind: "totp", value: "123456" });
  });

  it("کد پشتیبان را نرمال و با خط تیره برمیگرداند", () => {
    expect(normalizeMfaInput("abcd1234ef56")).toEqual({ kind: "recovery", value: "ABCD-1234-EF56" });
    expect(normalizeMfaInput("AB-CD-12-34-EF-56")).toEqual({ kind: "recovery", value: "ABCD-1234-EF56" });
  });

  it("ورودی نامعتبر را رد میکند", () => {
    expect(normalizeMfaInput("123")).toBeNull();
    expect(normalizeMfaInput("GGGG-1234-EF56")).toBeNull();
    expect(normalizeMfaInput("")).toBeNull();
  });
});
