import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP (RFC 6238) — بدون وابستگی خارجی.
 * clips: HMAC-SHA1، ۶ رقم، گام ۳۰ ثانیه، تحمل ±۱ گام (در مجموع حداکثر ۹۰ ثانیه).
 * کلیدها توسط FieldCrypto در DB رمزنگاری میشوند؛ این فایل فقط محاسبه و رمزگذاری Base32 را انجام میدهد.
 */
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SEC = 30;
export const TOTP_DIGITS = 6;
export const TOTP_WINDOW = 1;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.trim().toUpperCase().replace(/=+$/, "").replace(/[\s-]/g, "");
  if (!clean || !/^[A-Z2-7]+$/.test(clean)) throw new Error("invalid base32");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) throw new Error("invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** dynamic truncation مطابق RFC 4226 */
export function hotp(secret: Uint8Array, counter: bigint, digits = TOTP_DIGITS): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(counter);
  const mac = createHmac("sha1", Buffer.from(secret)).update(buf).digest();
  const off = mac[mac.length - 1]! & 0x0f;
  const code = ((mac[off]! & 0x7f) << 24) | ((mac[off + 1]!) << 16) | ((mac[off + 2]!) << 8) | mac[off + 3]!;
  return String(code % 10 ** digits).padStart(digits, "0");
}

export function totpAt(secret: Uint8Array, nowMs: number, stepSec = TOTP_STEP_SEC): string {
  return hotp(secret, BigInt(Math.floor(nowMs / 1000 / stepSec)));
}

/** مقایسهی ثابتزمان + تحمل ±window گام؛ کد باید دقیقاً digits رقم باشد. */
export function verifyTotp(
  secret: Uint8Array,
  code: string,
  nowMs: number,
  window = TOTP_WINDOW,
  stepSec = TOTP_STEP_SEC,
): boolean {
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(code)) return false;
  const step = Math.floor(nowMs / 1000 / stepSec);
  let matched = false;
  for (let d = -window; d <= window; d++) {
    const candidate = Buffer.from(totpAt(secret, (step + d) * stepSec * 1000, stepSec));
    const given = Buffer.from(code);
    if (candidate.length === given.length && timingSafeEqual(candidate, given)) matched = true;
  }
  return matched;
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** URI استاندارد Google Authenticator / Authenticator apps */
export function otpauthUri(secretBase32: string, issuer: string, label: string): string {
  const url = new URL("otpauth://totp/");
  url.pathname = `${encodeURIComponent(issuer)}:${encodeURIComponent(label)}`;
  url.searchParams.set("secret", secretBase32);
  url.searchParams.set("issuer", issuer);
  url.searchParams.set("algorithm", "SHA1");
  url.searchParams.set("digits", String(TOTP_DIGITS));
  url.searchParams.set("period", String(TOTP_STEP_SEC));
  return url.toString();
}

/** کدهای پشتیبان تکبارمصرف: فقط hash ی آنها ذخیره میشود. */
export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const b = randomBytes(6).toString("hex").toUpperCase();
    return `${b.slice(0, 4)}-${b.slice(4, 8)}-${b.slice(8)}`;
  });
}

export function hashRecoveryCode(code: string): string {
  return createHmac("sha256", Buffer.from("nobatyar-mfa-recovery-v1")).update(code.replace(/[-\s]/g, "").toUpperCase()).digest("hex");
}
