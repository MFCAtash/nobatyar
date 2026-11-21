import { describe, expect, it } from "vitest";
import { describePaymentConfig, loadPaymentConfig, parseStrictBool } from "./payment.config";

const MID = "11111111-2222-3333-4444-555555555555";
const prodBase = {
  NODE_ENV: "production",
  PAYMENT_GATEWAY: "zarinpal",
  ZARINPAL_MERCHANT_ID: MID,
  ALLOWED_CALLBACK_ORIGINS: "https://example.ir",
  WEB_ORIGIN: "https://example.ir",
} as NodeJS.ProcessEnv;
const prod = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({ ...prodBase, ...extra });

describe("loadPaymentConfig — production fail-closed", () => {
  it("تنظیمات سالم production بالا می‌آید", () => {
    const c = loadPaymentConfig(prod());
    expect(c.primary).toBe("zarinpal");
    expect(c.isProduction).toBe(true);
    expect(c.zarinpal?.sandbox).toBe(false);
  });

  it("ZARINPAL_SANDBOX=true در production ⇒ توقف", () => {
    expect(() => loadPaymentConfig(prod({ ZARINPAL_SANDBOX: "true" }))).toThrow(/sandbox flag/);
  });

  it("flag سندباکسِ درگاهِ «غیرفعال» هم در production ممنوع است", () => {
    expect(() => loadPaymentConfig(prod({ IDPAY_SANDBOX: "true" }))).toThrow(/IDPAY_SANDBOX/);
    expect(() => loadPaymentConfig(prod({ ZIBAL_SANDBOX: "true" }))).toThrow(/ZIBAL_SANDBOX/);
  });

  it("مقدار مبهم برای flag (yes/1/True) ⇒ خطا، نه تفسیرِ نادرست", () => {
    for (const v of ["yes", "1", "True", "TRUE", "on"]) {
      expect(() => loadPaymentConfig(prod({ ZARINPAL_SANDBOX: v }))).toThrow(/exactly "true" or "false"/);
    }
  });

  it("PAYMENT_GATEWAY=sandbox در production ⇒ توقف", () => {
    expect(() => loadPaymentConfig(prod({ PAYMENT_GATEWAY: "sandbox" }))).toThrow(/sandbox/);
  });

  it("PAYMENT_SANDBOX_MODE در production ⇒ توقف", () => {
    expect(() => loadPaymentConfig(prod({ PAYMENT_SANDBOX_MODE: "success" }))).toThrow(/PAYMENT_SANDBOX_MODE/);
  });

  it("PAYMENT_GATEWAY الزامی است (پیش‌فرضِ نااَمن نداریم)", () => {
    const env = prod();
    delete env.PAYMENT_GATEWAY;
    expect(() => loadPaymentConfig(env)).toThrow(/PAYMENT_GATEWAY is required/);
  });

  it("درگاه اصلی بدون مشخصات ⇒ توقف", () => {
    const env = prod();
    delete env.ZARINPAL_MERCHANT_ID;
    expect(() => loadPaymentConfig(env)).toThrow(/credentials are not set/);
  });

  it("merchant ی آزمایشی Zibal در production ممنوع", () => {
    expect(() => loadPaymentConfig(prod({ PAYMENT_GATEWAY: "zibal", ZIBAL_MERCHANT: "zibal" }))).toThrow(/test merchant/);
    expect(() => loadPaymentConfig(prod({ PAYMENT_GATEWAY: "zibal", ZIBAL_MERCHANT: "ZIBAL" }))).toThrow(/test merchant/);
    expect(loadPaymentConfig(prod({ PAYMENT_GATEWAY: "zibal", ZIBAL_MERCHANT: "realmerchant" })).primary).toBe("zibal");
  });

  it("ALLOWED_CALLBACK_ORIGINS الزامی و فقط https", () => {
    const env = prod();
    delete env.ALLOWED_CALLBACK_ORIGINS;
    expect(() => loadPaymentConfig(env)).toThrow(/ALLOWED_CALLBACK_ORIGINS is required/);
    expect(() => loadPaymentConfig(prod({ ALLOWED_CALLBACK_ORIGINS: "http://example.ir", WEB_ORIGIN: "http://example.ir" }))).toThrow(/https/);
    expect(() => loadPaymentConfig(prod({ ALLOWED_CALLBACK_ORIGINS: "https://example.ir/path" }))).toThrow(/bare origins/);
    expect(() => loadPaymentConfig(prod({ ALLOWED_CALLBACK_ORIGINS: "*" }))).toThrow(/invalid origin/);
  });

  it("WEB_ORIGIN باید در لیست مجاز باشد", () => {
    expect(() => loadPaymentConfig(prod({ WEB_ORIGIN: "https://other.ir" }))).toThrow(/WEB_ORIGIN/);
  });

  it("شناسه‌ی merchant ی زرین‌پال باید UUID باشد", () => {
    expect(() => loadPaymentConfig(prod({ ZARINPAL_MERCHANT_ID: "abc" }))).toThrow(/UUID/);
  });
});

describe("loadPaymentConfig — failover", () => {
  const withFallback = (extra: Record<string, string>) => prod({ ZIBAL_MERCHANT: "realmerchant", IDPAY_API_KEY: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", ...extra });

  it("ترتیب جایگزین‌ها حفظ می‌شود", () => {
    const c = loadPaymentConfig(withFallback({ PAYMENT_FALLBACK_GATEWAYS: "zibal, idpay" }));
    expect(c.fallbacks).toEqual(["zibal", "idpay"]);
  });

  it("جایگزین بدون مشخصات / تکراری / برابر اصلی / ناشناخته ⇒ خطا", () => {
    expect(() => loadPaymentConfig(prod({ PAYMENT_FALLBACK_GATEWAYS: "zibal" }))).toThrow(/credentials are not set/);
    expect(() => loadPaymentConfig(withFallback({ PAYMENT_FALLBACK_GATEWAYS: "zibal,zibal" }))).toThrow(/duplicate/);
    expect(() => loadPaymentConfig(withFallback({ PAYMENT_FALLBACK_GATEWAYS: "zarinpal" }))).toThrow(/primary/);
    expect(() => loadPaymentConfig(withFallback({ PAYMENT_FALLBACK_GATEWAYS: "paypal" }))).toThrow(/unknown/);
    expect(() => loadPaymentConfig(withFallback({ PAYMENT_FALLBACK_GATEWAYS: "sandbox" }))).toThrow(/unknown/);
  });
});

describe("loadPaymentConfig — غیر production", () => {
  it("بدون هیچ تنظیمی ⇒ درگاه sandbox (برای dev/CI)", () => {
    const c = loadPaymentConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv);
    expect(c.primary).toBe("sandbox");
    expect(c.sandboxMode).toBe("success");
    expect(c.isProduction).toBe(false);
  });

  it("flag سندباکس در dev مجاز است", () => {
    const c = loadPaymentConfig({ NODE_ENV: "development", PAYMENT_GATEWAY: "zarinpal", ZARINPAL_MERCHANT_ID: MID, ZARINPAL_SANDBOX: "true" } as NodeJS.ProcessEnv);
    expect(c.zarinpal?.sandbox).toBe(true);
  });

  it("حالت sandbox نامعتبر ⇒ خطا", () => {
    expect(() => loadPaymentConfig({ NODE_ENV: "test", PAYMENT_SANDBOX_MODE: "always" } as NodeJS.ProcessEnv)).toThrow(/PAYMENT_SANDBOX_MODE/);
  });
});

describe("loadPaymentConfig — اعداد", () => {
  it("مهلت نگه‌داشتن اسلات باید از اولین بازبینی job بیشتر باشد", () => {
    expect(() => loadPaymentConfig(prod({ PAYMENT_HOLD_MIN: "10" }))).toThrow(/PAYMENT_HOLD_MIN must outlast/);
    expect(() => loadPaymentConfig(prod({ PAYMENT_RECONCILE_AFTER_MIN: "5", PAYMENT_HOLD_MIN: "20", PAYMENT_RECONCILE_EVERY_SEC: "300" }))).not.toThrow();
  });
  it("عدد خارج از بازه ⇒ خطا", () => {
    expect(() => loadPaymentConfig(prod({ PAYMENT_RECONCILE_AFTER_MIN: "1" }))).toThrow(/PAYMENT_RECONCILE_AFTER_MIN/);
    expect(() => loadPaymentConfig(prod({ PAYMENT_HTTP_TIMEOUT_MS: "abc" }))).toThrow(/PAYMENT_HTTP_TIMEOUT_MS/);
  });
});

describe("parseStrictBool / describePaymentConfig", () => {
  it("parseStrictBool", () => {
    expect(parseStrictBool(undefined, "X")).toBe(false);
    expect(parseStrictBool("", "X")).toBe(false);
    expect(parseStrictBool("true", "X")).toBe(true);
    expect(parseStrictBool("false", "X")).toBe(false);
  });
  it("خلاصه‌ی لاگ هیچ رازی ندارد", () => {
    const c = loadPaymentConfig(prod());
    const s = describePaymentConfig(c);
    expect(s).toContain("primary=zarinpal");
    expect(s.includes(MID)).toBe(false);
  });
});
