import { describe, expect, it } from "vitest";
import { checkAdminPhone, DEMO_PHONES, demoPhonesNormalized, planSeed } from "./bootstrap-policy";

describe("planSeed", () => {
  it("production: فقط تخصص‌ها؛ کاربر نمونه هرگز", () => {
    expect(planSeed({ NODE_ENV: "production" })).toEqual({ specialties: true, demoUsers: false });
    expect(planSeed({ NODE_ENV: "production", SEED_DEMO_USERS: "false" }).demoUsers).toBe(false);
  });
  it("production با SEED_DEMO_USERS=true ⇒ خطا (نه نادیده‌گرفتن)", () => {
    expect(() => planSeed({ NODE_ENV: "production", SEED_DEMO_USERS: "true" })).toThrow(/not allowed in production/);
  });
  it("توسعه/تست: پیش‌فرض کاربر نمونه، قابل خاموش‌کردن", () => {
    expect(planSeed({ NODE_ENV: "development" }).demoUsers).toBe(true);
    expect(planSeed({}).demoUsers).toBe(true);
    expect(planSeed({ NODE_ENV: "test", SEED_DEMO_USERS: "false" }).demoUsers).toBe(false);
  });
  it("مقدار نامعتبر flag ⇒ خطا", () => {
    expect(() => planSeed({ SEED_DEMO_USERS: "yes" })).toThrow(/exactly/);
  });
});

describe("checkAdminPhone", () => {
  it("شماره‌ی واقعی با تأیید یکسان ⇒ نرمال‌شده", () => {
    expect(checkAdminPhone("09121234597", "+98 912 123 4597")).toEqual({ ok: true, phone: "989121234597" });
    expect(checkAdminPhone("۰۹۱۲۱۲۳۴۵۹۷", "09121234597")).toEqual({ ok: true, phone: "989121234597" });
  });
  it("نبود هر یک از دو مقدار ⇒ missing", () => {
    expect(checkAdminPhone(undefined, "09121234597")).toEqual({ ok: false, reason: "missing" });
    expect(checkAdminPhone("09121234597", "")).toEqual({ ok: false, reason: "missing" });
  });
  it("نامعتبر و ناهمخوان", () => {
    expect(checkAdminPhone("12345", "12345")).toEqual({ ok: false, reason: "invalid" });
    expect(checkAdminPhone("09121234597", "09121234598")).toEqual({ ok: false, reason: "mismatch" });
  });
  it("همه‌ی شماره‌های نمونه رد می‌شوند (به هر قالب)", () => {
    for (const p of DEMO_PHONES) expect(checkAdminPhone(p, p)).toEqual({ ok: false, reason: "demo" });
    expect(checkAdminPhone("+989120000003", "989120000003")).toEqual({ ok: false, reason: "demo" });
    expect(demoPhonesNormalized()).toEqual(["989120000001", "989120000002", "989120000003"]);
  });
  it("شماره‌ی ساختگی/پلکانی ⇒ suspicious", () => {
    expect(checkAdminPhone("09111111111", "09111111111")).toEqual({ ok: false, reason: "suspicious" });
    expect(checkAdminPhone("09121234567", "09121234567")).toEqual({ ok: false, reason: "suspicious" });
  });
});
