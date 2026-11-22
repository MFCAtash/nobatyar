import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { API, otpFor } from "../helpers/api";

/**
 * M1 — ورود ادمین و فعالسازی MFA.
 *
 * پیشنیاز: API با E2E_TEST_HOOKS=true و SMS_PROVIDER=memory (هک /__e2e/admin و /__e2e/otp).
 *
 * حالت پیشفرض e2e (ADMIN_REQUIRE_MFA=false): تست UI کامل است: ورود با OTP، تکمیل onboarding،
 * رفتن به /security، ثبت TOTP از طریق رابط کاربری و تأیید کد با TOTP محاسبهشده در تست.
 *
 * حالت سختگیرانه (ADMIN_REQUIRE_MFA=true): بلافاصله بعد از OTP به /mfa هدایت میشویم؛ در آن حالت
 * تست MFA را از سمت API فعال میکند و کد را در همان صفحهی چالش وارد میکند تا به next برگردد.
 * پوشش دستی مراحل چالش/کد پشتیبان در runbook مستند است (docs/testing-e2e-load.md)؛ تست دوم
 * (API-level) عملکرد enroll/enable/status را مستقل از UI نیز تأیید میکند.
 */

interface AdminSeed {
  adminId: string;
  phone: string;
  fullName: string;
}
interface Enrollment {
  secret: string;
  uri: string;
  recoveryCodes: string[];
}

async function seedAdmin(request: APIRequestContext): Promise<AdminSeed> {
  const r = await request.post(`${API}/__e2e/admin`);
  expect(r.ok(), `هیچ hook ی ادمین موجود نیست (E2E_TEST_HOOKS=true؟): ${r.status()}`).toBeTruthy();
  return (await r.json()) as AdminSeed;
}

/** TOTP (RFC 6238): HMAC-SHA1، ۶ رقم، گام ۳۰ ثانیه — بدون وابستگی خارجی. */
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Decode(input: string): Buffer {
  const clean = input.trim().toUpperCase().replace(/=+$/, "").replace(/[\s-]/g, "");
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
function totp(secret: string): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const mac = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const off = mac[mac.length - 1]! & 0x0f;
  const code = ((mac[off]! & 0x7f) << 24) | (mac[off + 1]! << 16) | (mac[off + 2]! << 8) | mac[off + 3]!;
  return String(code % 1_000_000).padStart(6, "0");
}

/** ورود ادمین از UI با OTP؛ onboarding لازم را هم تکمیل میکند. */
async function loginAdminViaUi(page: Page, request: APIRequestContext, seed: AdminSeed, target: string) {
  await page.goto(`/login?next=${encodeURIComponent(target)}`);
  await page.getByLabel("شماره‌ی موبایل").fill(seed.phone);
  await page.getByRole("button", { name: "دریافت کد تأیید" }).click();
  const code = await otpFor(request, seed.phone);
  await page.locator('input[autocomplete="one-time-code"]').fill(code);
  await page.locator("form button.btn-primary").last().click({ force: true, timeout: 15_000 });
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

  if (page.url().includes("/onboarding")) {
    await page.getByLabel("نام و نام خانوادگی").fill(seed.fullName);
    await page.getByRole("checkbox", { name: /قوانین/ }).check();
    await page.getByRole("checkbox", { name: /اطلاعات سلامت/ }).check();
    await page.getByRole("button", { name: "ادامه", exact: true }).click();
  }
}

/** ورود از سمت API — توکن حاصل فاقد claim مfa است و برای enroll/enable قابل استفاده است. */
async function loginAdminViaApi(request: APIRequestContext, phone: string): Promise<string> {
  const sent = await request.post(`${API}/auth/otp/request`, { data: { phone } });
  expect(sent.ok(), `otp request failed: ${sent.status()}`).toBeTruthy();
  const code = await otpFor(request, phone);
  const r = await request.post(`${API}/auth/otp/verify`, { data: { phone, code } });
  expect(r.ok(), `admin login failed: ${r.status()}`).toBeTruthy();
  return ((await r.json()) as { accessToken: string }).accessToken;
}

async function enableMfa(request: APIRequestContext, accessToken: string): Promise<Enrollment> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const enrolled = await request.post(`${API}/me/mfa/enroll`, { headers });
  expect(enrolled.ok(), `enroll failed: ${enrolled.status()}`).toBeTruthy();
  const enrollment = (await enrolled.json()) as Enrollment;

  const enabled = await request.post(`${API}/me/mfa/enable`, { headers, data: { code: totp(enrollment.secret) } });
  expect(enabled.ok(), `enable failed: ${enabled.status()}`).toBeTruthy();
  return enrollment;
}

test.describe("admin MFA", () => {
  test("UI: ورود ادمین → /security → ثبت TOTP → وضعیت فعال", async ({ page, request }) => {
    const seed = await seedAdmin(request);
    const target = "/security";
    await loginAdminViaUi(page, request, seed, target);

    if (/\/mfa(?:[?/]|$)/.test(page.url())) {
      // ADMIN_REQUIRE_MFA=true: چالش قبل از /security است. MFA را با نشستی تازه از API فعال
      // میکنیم و کد را در همان صفحهی چالش وارد میکنیم تا به مسیر مقصد برگردد.
      const enrollment = await enableMfa(request, await loginAdminViaApi(request, seed.phone));
      await page.locator('input[autocomplete="one-time-code"]').fill(totp(enrollment.secret));
      await page.getByRole("button", { name: "تأیید و ادامه" }).click();
      await expect(page).toHaveURL(/\/security$/);
      await expect(page.locator(".badge.status-ok", { hasText: "فعال" })).toBeVisible();
      return;
    }

    await expect(page).toHaveURL(/\/security$/);
    await expect(page.getByRole("heading", { name: "امنیت حساب" })).toBeVisible();
    await expect(page.locator(".badge.status-bad", { hasText: "غیرفعال" })).toBeVisible();

    const enrollResponse = page.waitForResponse(
      (r) => r.url().includes("/me/mfa/enroll") && r.request().method() === "POST" && r.ok(),
    );
    await page.getByRole("button", { name: "شروع ثبت TOTP" }).click();
    const enrollment = (await (await enrollResponse).json()) as Enrollment;

    await page.getByLabel("کد ۶ رقمی برنامه").fill(totp(enrollment.secret));
    await page.getByRole("button", { name: "تأیید و فعالسازی" }).click();

    await expect(page.locator(".badge.status-ok", { hasText: "فعال" })).toBeVisible();
  });

  test("API: enroll → TOTP → enable → GET /me/mfa وضعیت فعال", async ({ request }) => {
    const seed = await seedAdmin(request);
    const accessToken = await loginAdminViaApi(request, seed.phone);
    await enableMfa(request, accessToken);

    const status = await request.get(`${API}/me/mfa`, { headers: { Authorization: `Bearer ${accessToken}` } });
    expect(status.ok(), `mfa status failed: ${status.status()}`).toBeTruthy();
    const mfa = (await status.json()) as { enabled: boolean; recoveryCodesLeft: number };
    expect(mfa.enabled).toBe(true);
    expect(mfa.recoveryCodesLeft).toBeGreaterThan(0);
  });
});
