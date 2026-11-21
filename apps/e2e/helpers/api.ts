import { expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

/** API از طریق خود وب (rewrite ی /api/v1) ⇒ کوکی refresh هم‌مبدأ است. */
export const API = "/api/v1";

export const uniq = () => Math.random().toString(36).slice(2, 8);

/** موبایل معتبر تصادفی (09 + ۹ رقم) */
export function randomPhone(): string {
  return "09" + String(Math.floor(100_000_000 + Math.random() * 899_999_999));
}

export async function seedDoctor(request: APIRequestContext, opts: { fullName: string; feeRial?: number; autoConfirm?: boolean }) {
  const r = await request.post(`${API}/__e2e/doctor`, { data: { feeRial: 1_000_000, autoConfirm: false, ...opts } });
  expect(r.ok(), `seed doctor failed (آیا E2E_TEST_HOOKS=true است؟): ${r.status()}`).toBeTruthy();
  return (await r.json()) as { doctorId: string; phone: string; fullName: string };
}

/** کد OTP (یک‌بارمصرف) را از hook ی تست می‌خواند؛ تا ۵ ثانیه تلاش می‌کند. */
export async function otpFor(request: APIRequestContext, phone: string): Promise<string> {
  for (let i = 0; i < 25; i++) {
    const r = await request.get(`${API}/__e2e/otp`, { params: { phone } });
    if (r.ok()) return ((await r.json()) as { code: string }).code;
    await new Promise((res) => setTimeout(res, 200));
  }
  throw new Error("OTP not found");
}

/** ورود از طریق UI. اگر fullName بدهید، ثبت‌نام (onboarding) هم کامل می‌شود. */
export async function loginViaUi(page: Page, request: APIRequestContext, phone: string, fullName?: string) {
  await page.goto("/login");
  await page.getByLabel("شماره‌ی موبایل").fill(phone);
  await page.getByRole("button", { name: "دریافت کد تأیید" }).click();
  const code = await otpFor(request, phone);
  await page.locator('input[autocomplete="one-time-code"]').fill(code);
  await page.locator('form button.btn-primary').last().click({ force: true, timeout: 15_000 });
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
  if (fullName) {
    await expect(page).toHaveURL(/\/onboarding/);
    await page.getByLabel("نام و نام خانوادگی").fill(fullName);
    await page.getByRole("checkbox", { name: /قوانین/ }).check();
    await page.getByRole("checkbox", { name: /اطلاعات سلامت/ }).check();
    await page.getByRole("button", { name: "ادامه", exact: true }).click();
  }
  await expect(page).not.toHaveURL(/\/(login|onboarding)/);
}

/** از «جستجو» تا «صفحه‌ی نوبتِ رزروشده (فردا، اولین ساعت خالی)». */
export async function searchAndBook(page: Page, doctorName: string, token: string, reason?: string): Promise<string> {
  await page.goto("/");
  await page.getByRole("search").getByLabel("نام پزشک").fill(token);
  await page.getByRole("link", { name: new RegExp(doctorName) }).first().click();
  await expect(page.getByRole("heading", { name: doctorName })).toBeVisible();
  await page.getByRole("group", { name: "روز" }).getByRole("button").nth(1).click(); // فردا؛ همیشه اسلات دارد
  await page.getByRole("group", { name: "ساعت‌های خالی" }).getByRole("button").first().click();
  if (reason) await page.getByLabel(/دلیل مراجعه/).fill(reason);
  await page.getByRole("button", { name: "ثبت نوبت", exact: true }).click();
  await expect(page).toHaveURL(/\/appointments\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname;
}
