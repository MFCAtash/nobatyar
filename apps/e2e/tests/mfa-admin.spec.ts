import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { API, otpFor } from "../helpers/api";

/**
 * ⚠️ این تستها عمداً اسکیپاند تا زمانی که hook ی ادمین اضافه شود.
 *
 * بررسی apps/api/src/e2e/e2e.controller.ts: hook های موجود فقط
 *   GET  /__e2e/otp
 *   POST /__e2e/doctor
 *   GET  /__e2e/ping
 * هستند و هیچ hook ی ادمینی وجود ندارد. /demo/login هم جایگزین نیست: وابسته به
 * DEMO_AUTOLOGIN=true + DEMO_ROLE=ADMIN + seeding دستی است و بعد از فعال شدن MFA
 * توکنی «دارای claim مfa» صادر میکند (auth.service.ts) پس نمیتواند حالت چالش را بسازد.
 *
 * برای فعال کردن تستها باید hook ی زیر به E2eController اضافه شود (فقط E2E_TEST_HOOKS=true):
 *   POST /__e2e/admin  →  { phone: string; accessToken: string }
 *     - ادمینی با پروفایل کامل بسازد (بدون نیاز به onboarding) و MFA آن خاموش باشد
 *     - accessToken برگرداندهشده فاقد claim مfa باشد (برای enroll/enable از سمت API)
 *   و API با ADMIN_REQUIRE_MFA=true اجرا شود.
 *
 * جریان واقعی: با ADMIN_REQUIRE_MFA=true خود /auth/otp/verify برای ادمین بدون MFA
 * خطای 403 mfa_required میدهد ⇒ LoginContainer به /mfa?next=... هدایت میشود. سپس MFA
 * از سمت API فعال شده و کد پشتیبان/TOTP در همان صفحهی چالش ارسال میشود تا next برگردد.
 */

interface AdminSeed {
  phone: string;
  /** access token بدون claim مfa — فقط برای enroll/enable از سمت API */
  accessToken: string;
}

async function seedAdmin(request: APIRequestContext): Promise<AdminSeed> {
  const r = await request.post(`${API}/__e2e/admin`);
  expect(r.ok(), `هیچ hook ی ادمین موجود نیست (E2E_TEST_HOOKS=true؟): ${r.status()}`).toBeTruthy();
  return (await r.json()) as AdminSeed;
}

/** ورود ادمین از UI: چون سیاست فعال است، OTP با mfa_required به صفحهی چالش میرود. */
async function loginAdminIntoChallenge(page: Page, request: APIRequestContext, phone: string, target: string) {
  await page.goto(`/login?next=${encodeURIComponent(target)}`);
  await page.getByLabel("شماره‌ی موبایل").fill(phone);
  await page.getByRole("button", { name: "دریافت کد تأیید" }).click();
  const code = await otpFor(request, phone);
  await page.locator('input[autocomplete="one-time-code"]').fill(code);
  await page.locator("form button.btn-primary").last().click({ force: true, timeout: 15_000 });
  await expect(page).toHaveURL(new RegExp(`/mfa\\?next=${encodeURIComponent(target)}`));
  await expect(page.getByRole("heading", { name: "تأیید دومرحلهای" })).toBeVisible();
}

interface Enrollment {
  secret: string;
  recoveryCodes: string[];
}

/** فعالسازی MFA از سمت API بدون رفرش کردن صفحه (تا وضعیت چالش در مرورگر بماند). */
async function enableMfa(request: APIRequestContext, seed: AdminSeed): Promise<Enrollment> {
  const headers = { Authorization: `Bearer ${seed.accessToken}` };
  const enrolled = await request.post(`${API}/me/mfa/enroll`, { headers });
  expect(enrolled.ok(), `enroll failed: ${enrolled.status()}`).toBeTruthy();
  const enrollment = (await enrolled.json()) as Enrollment;

  const enabled = await request.post(`${API}/me/mfa/enable`, {
    headers,
    data: { code: totp(enrollment.secret) },
  });
  expect(enabled.ok(), `enable failed: ${enabled.status()}`).toBeTruthy();
  return enrollment;
}

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

async function submitCode(page: Page, code: string) {
  await page.locator('input[autocomplete="one-time-code"]').fill(code);
  await page.getByRole("button", { name: "تأیید و ادامه" }).click();
}

test.describe("admin MFA challenge", () => {
  test.skip("کد پشتیبان: ورود ادمین → /mfa?next=... → بازگشت به مسیر مقصد", async ({ page, request }) => {
    const seed = await seedAdmin(request);
    const target = "/admin/security";
    await loginAdminIntoChallenge(page, request, seed.phone, target);
    const enrollment = await enableMfa(request, seed);

    await submitCode(page, enrollment.recoveryCodes[0]!);
    await expect(page).toHaveURL(/\/admin\/security$/);
    await expect(page.getByRole("heading", { name: /امنیت حساب/ })).toBeVisible();
  });

  test.skip("TOTP: ورود ادمین → /mfa?next=... → بازگشت به مسیر مقصد", async ({ page, request }) => {
    const seed = await seedAdmin(request);
    const target = "/admin/verifications";
    await loginAdminIntoChallenge(page, request, seed.phone, target);
    const enrollment = await enableMfa(request, seed);

    await submitCode(page, totp(enrollment.secret));
    await expect(page).toHaveURL(/\/admin\/verifications$/);
  });
});
