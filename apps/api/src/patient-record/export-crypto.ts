import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * M9 — خروجی رمزشدهٔ پرونده با «کلید بیمار».
 *
 * کلید از عبارت عبور کاربر با scrypt مشتق می‌شود و هرگز ذخیره نمی‌شود؛ سرور
 * نمی‌تواند خروجی را بدون عبارت عبور باز کند.
 */

export interface EncryptedExport {
  v: 1;
  kdf: "scrypt";
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
  sha256: string;
}

const MIN_PASSPHRASE = 12;

export function assertStrongPassphrase(passphrase: string): void {
  if (typeof passphrase !== "string" || passphrase.trim().length < MIN_PASSPHRASE) {
    throw new Error(`passphrase must be at least ${MIN_PASSPHRASE} characters`);
  }
}

export function encryptExport(plaintext: string, passphrase: string): EncryptedExport {
  assertStrongPassphrase(passphrase);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase.normalize("NFKC"), salt, 32, { N: 16384, r: 8, p: 1 });
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("nobatyar:export:v1"));
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf-8")), cipher.final()]);
  return {
    v: 1,
    kdf: "scrypt",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    sha256: createHash("sha256").update(plaintext, "utf-8").digest("hex"),
  };
}

export function decryptExport(payload: EncryptedExport, passphrase: string): string {
  assertStrongPassphrase(passphrase);
  if (payload?.v !== 1 || payload.kdf !== "scrypt") throw new Error("unsupported export format");
  const salt = Buffer.from(payload.salt, "base64");
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16) throw new Error("invalid export envelope");
  const key = scryptSync(passphrase.normalize("NFKC"), salt, 32, { N: 16384, r: 8, p: 1 });
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from("nobatyar:export:v1"));
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, "base64")), decipher.final()]).toString("utf-8");
  const digest = createHash("sha256").update(plain, "utf-8").digest();
  const expected = Buffer.from(payload.sha256, "hex");
  if (expected.length !== digest.length || !timingSafeEqual(digest, expected)) {
    throw new Error("export integrity check failed");
  }
  return plain;
}
