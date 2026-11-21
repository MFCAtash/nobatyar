/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deriveApiEnv, parseDotenv, runPreflight } from "./preflight";

const b64 = () => randomBytes(32).toString("base64");
const hex = () => randomBytes(24).toString("hex");
const good = (): Record<string, string> => ({
  DOMAIN: "nobatyar.ir", LIVEKIT_DOMAIN: "lk.nobatyar.ir", ACME_EMAIL: "ops@nobatyar.ir", IMAGE_TAG: "a1b2c3d",
  POSTGRES_USER: "nobatyar_owner", POSTGRES_PASSWORD: hex(), POSTGRES_DB: "nobatyar", APP_DB_USER: "nobatyar_app", APP_DB_PASSWORD: hex(), REDIS_PASSWORD: hex(),
  FIELD_KEYS: `1:${b64()}`, FIELD_KEY_ACTIVE: "1", BLIND_INDEX_KEY: b64(), JWT_ACCESS_SECRET: b64(), OTP_SECRET: b64(),
  SMS_PROVIDER: "kavenegar", KAVENEGAR_API_KEY: "kv-" + hex(), KAVENEGAR_TEMPLATE: "otp",
  LIVEKIT_API_KEY: "lk-prod-key", LIVEKIT_API_SECRET: hex() + hex(),
  PAYMENT_GATEWAY: "zarinpal", ZARINPAL_MERCHANT_ID: "123e4567-e89b-12d3-a456-426614174000", ZARINPAL_SANDBOX: "false",
  STORAGE_DOMAIN: "s3.nobatyar.ir", MINIO_ROOT_USER: "root_" + hex().slice(0, 8), MINIO_ROOT_PASSWORD: hex(), MINIO_APP_USER: "nobatyar_app", MINIO_APP_PASSWORD: hex(),
  METRICS_TOKEN: hex(), SENTRY_DSN: "https://abc@o1.ingest.sentry.io/1", NEXT_PUBLIC_SENTRY_DSN: "https://abc@o1.ingest.sentry.io/1", BACKUP_AGE_RECIPIENT: "age1xyz",
});

describe("preflight", () => {
  it("پیکربندی سالم ⇒ بدون خطا", () => {
    const r = runPreflight(good());
    expect(r.errors).toEqual([]);
  });

  it("placeholder و کلید ناموجود ⇒ خطا", () => {
    const f = good(); f.POSTGRES_PASSWORD = "change-me"; delete (f as any).OTP_SECRET;
    const r = runPreflight(f);
    expect(r.errors.some((e) => e.startsWith("POSTGRES_PASSWORD") && e.includes("placeholder"))).toBe(true);
    expect(r.errors.some((e) => e.startsWith("OTP_SECRET"))).toBe(true);
  });

  it("نقش اپ = مالک یا رمز یکسان ⇒ خطا (RLS دور زده می‌شود)", () => {
    const f = good(); f.APP_DB_USER = f.POSTGRES_USER; f.APP_DB_PASSWORD = f.POSTGRES_PASSWORD;
    const e = runPreflight(f).errors.join("\n");
    expect(e).toContain("APP_DB_USER");
    expect(e).toContain("APP_DB_PASSWORD");
  });

  it("رمز ناامن برای URL، کلیدهای رمزنگاری نامعتبر یا تکراری ⇒ خطا", () => {
    let f = good(); f.REDIS_PASSWORD = "p@ss:word/1234567890abcdef";
    expect(runPreflight(f).errors.join()).toContain("REDIS_PASSWORD");
    f = good(); f.FIELD_KEYS = "1:AAAA";
    expect(runPreflight(f).errors.join()).toContain("FIELD_KEYS");
    f = good(); f.FIELD_KEY_ACTIVE = "2";
    expect(runPreflight(f).errors.join()).toContain("FIELD_KEY_ACTIVE");
    f = good(); f.OTP_SECRET = f.JWT_ACCESS_SECRET;
    expect(runPreflight(f).errors.join()).toContain("مستقل");
  });

  it("ذخیره‌ساز: دامنه‌ی تکراری، کاربر app = root، رمز یکسان یا نبود متغیر ⇒ خطا", () => {
    let f = good(); f.STORAGE_DOMAIN = f.DOMAIN!;
    expect(runPreflight(f).errors.join()).toContain("STORAGE_DOMAIN");
    f = good(); f.MINIO_APP_USER = f.MINIO_ROOT_USER!;
    expect(runPreflight(f).errors.join()).toContain("MINIO_APP_USER");
    f = good(); f.MINIO_APP_PASSWORD = f.MINIO_ROOT_PASSWORD!;
    expect(runPreflight(f).errors.join()).toContain("MINIO_APP_PASSWORD");
    f = good(); delete (f as any).MINIO_APP_PASSWORD;
    expect(runPreflight(f).errors.some((e) => e.startsWith("MINIO_APP_PASSWORD"))).toBe(true);
    f = good(); f.STORAGE_DOMAIN = "s3.example.ir";
    expect(runPreflight(f).errors.join()).toContain("STORAGE_DOMAIN");
  });

  it("sandbox/hook تست در production ⇒ خطا (همان loader های fail-closed)", () => {
    let f = good(); f.ZARINPAL_SANDBOX = "true";
    expect(runPreflight(f).errors.join()).toContain("payment");
    f = good(); f.PAYMENT_GATEWAY = "sandbox";
    expect(runPreflight(f).errors.join()).toContain("payment");
    f = good(); (f as any).E2E_TEST_HOOKS = "true";
    expect(runPreflight(f).errors.length).toBeGreaterThan(0);
    f = good(); f.SMS_PROVIDER = "console";
    expect(runPreflight(f).errors.length).toBeGreaterThan(0);
  });

  it("دامنه‌ی نمونه/localhost ⇒ خطا؛ هشدارها مانع نیستند", () => {
    let f = good(); f.DOMAIN = "localhost";
    expect(runPreflight(f).errors.join()).toContain("DOMAIN");
    f = good(); delete (f as any).METRICS_TOKEN; delete (f as any).SENTRY_DSN; f.IMAGE_TAG = "local";
    const r = runPreflight(f);
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBeGreaterThanOrEqual(3);
  });

  it("خروجی هرگز مقدار رازها را نمی‌آورد", () => {
    const f = good(); f.POSTGRES_PASSWORD = "change-me"; f.JWT_ACCESS_SECRET = "short";
    const out = JSON.stringify(runPreflight(f));
    expect(out.includes(f.JWT_ACCESS_SECRET)).toBe(false);
  });

  it("deriveApiEnv و parseDotenv", () => {
    expect(deriveApiEnv({ DOMAIN: "a.ir", LIVEKIT_DOMAIN: "lk.a.ir" })).toMatchObject({ NODE_ENV: "production", WEB_ORIGIN: "https://a.ir", LIVEKIT_URL: "wss://lk.a.ir", COOKIE_SECURE: "true" });
    expect(parseDotenv('# c\nA=1\nB="two words"\nexport C=3 # tail\n\nbad line\nD=')).toEqual({ A: "1", B: "two words", C: "3", D: "" });
  });
});
