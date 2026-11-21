import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  base32Decode, base32Encode, generateRecoveryCodes, generateTotpSecret, hashRecoveryCode,
  hotp, otpauthUri, TOTP_STEP_SEC, totpAt, verifyTotp,
} from "./totp";

const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii"));

describe("TOTP (RFC 6238)", () => {
  it("Base32 دور بسته است", () => {
    const raw = Buffer.from([0, 1, 2, 250, 251, 255]);
    expect(base32Decode(base32Encode(raw))).toEqual(raw);
    expect(base32Encode(Buffer.from("f", "ascii"))).toBe("MY");
  });

  it("بردارهای RFC 4226 (HMAC-SHA1 dynamic truncation)", () => {
    const s = Buffer.from("12345678901234567890", "ascii");
    const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
    expected.forEach((e, i) => expect(hotp(s, BigInt(i))).toBe(e));
  });

  it("کد ۶ رقمی و گام ۳۰ ثانیه با RFC 6238 مطابقت دارد", () => {
    // T0 = 59 s => counter 1 => 94287082 (8 رقم RFC؛ در اینجا ۶ رقم انتهایی)
    expect(totpAt(base32Decode(RFC_SECRET), 59_000)).toBe(hotp(base32Decode(RFC_SECRET), 1n));
    expect(TOTP_STEP_SEC).toBe(30);
  });

  it("تحول گام و پنجرهی ±۱ (حداکثر ۹۰ ثانیه)", () => {
    const sec = base32Decode(generateTotpSecret());
    const t = 1_700_000_000_000;
    const code = totpAt(sec, t);
    expect(verifyTotp(sec, code, t)).toBe(true);
    expect(verifyTotp(sec, code, t + 30_000)).toBe(true);
    expect(verifyTotp(sec, code, t - 30_000)).toBe(true);
    expect(verifyTotp(sec, code, t + 90_000)).toBe(false);
    expect(verifyTotp(sec, code, t, 0)).toBe(true);
    expect(verifyTotp(sec, code, t + 30_000, 0)).toBe(false);
  });

  it("کد نامعتبر رد میشود", () => {
    const sec = base32Decode(generateTotpSecret());
    expect(verifyTotp(sec, "12345", Date.now())).toBe(false);
    expect(verifyTotp(sec, "abcdef", Date.now())).toBe(false);
    expect(() => base32Decode("not base32!")).toThrow();
  });

  it("otpauth URI راز و پارامترها را دربر دارد", () => {
    const uri = otpauthUri("JBSWY3DPEHPK3PXP", "نوبتیار", "admin@example.com");
    const u = new URL(uri);
    expect(u.protocol).toBe("otpauth:");
    expect(u.searchParams.get("secret")).toBe("JBSWY3DPEHPK3PXP");
    expect(u.searchParams.get("digits")).toBe("6");
    expect(u.searchParams.get("period")).toBe("30");
  });

  it("کدهای پشتیبان یکتا و hash ی پایداراند", () => {
    const codes = generateRecoveryCodes(8);
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    expect(codes[0]).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(hashRecoveryCode(codes[0]!)).toBe(hashRecoveryCode(codes[0]!.toLowerCase().replace(/-/g, "")));
    expect(hashRecoveryCode(codes[0]!)).not.toBe(hashRecoveryCode(codes[1]!));
  });

  it("hotp از HMAC-SHA1 استاندارد استفاده میکند", () => {
    const s = Buffer.from("key", "ascii");
    const mac = createHmac("sha1", s).update(Buffer.from([0, 0, 0, 0, 0, 0, 0, 1])).digest();
    const off = mac[mac.length - 1]! & 0x0f;
    const n = ((mac[off]! & 0x7f) << 24) | (mac[off + 1]! << 16) | (mac[off + 2]! << 8) | mac[off + 3]!;
    expect(hotp(s, 1n)).toBe(String(n % 1_000_000).padStart(6, "0"));
  });
});
