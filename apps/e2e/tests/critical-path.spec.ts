import { expect, test } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { loginViaUi, randomPhone, searchAndBook, seedDoctor, uniq } from "../helpers/api";

/**
 * مسیر حیاتی «از ورود تا گفتگو» — ترتیبی، روی یک بیمار/پزشک/نوبت:
 *   ۱) ورود با OTP (و ثبت‌نام)   ۲) جستجو   ۳) رزرو   ۴) پرداخت sandbox   ۵) چت دوطرفه (بلادرنگ)
 */
test.describe.configure({ mode: "serial" });

const token = uniq();
const doctorName = `دکتر ${token}`;
const patientPhone = randomPhone();
let doctorPhone = "";
let patientCtx: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser, request }) => {
  doctorPhone = (await seedDoctor(request, { fullName: doctorName })).phone;
  patientCtx = await browser.newContext();
  page = await patientCtx.newPage();
});
test.afterAll(async () => { await patientCtx?.close(); });

test("۱) ورود با OTP و ثبت‌نام بیمار", async ({ request }) => {
  await loginViaUi(page, request, patientPhone, "بیمار آزمون");
});

test("۱-ب) کد اشتباه رد می‌شود و ورود انجام نمی‌شود", async ({ browser }) => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto("/login");
  await p.getByLabel("شماره‌ی موبایل").fill(randomPhone());
  await p.getByRole("button", { name: "دریافت کد تأیید" }).click();
  await p.locator('input[autocomplete="one-time-code"]').fill("000000");
  await p.locator("form button.btn-primary").last().click({ force: true });
  await expect(p.getByText(/نادرست یا منقضی/)).toBeVisible();
  await expect(p).toHaveURL(/\/login/);
  await ctx.close();
});

test("۲) جستجوی پزشک و ۳) رزرو ⇒ در انتظار پرداخت", async () => {
  await searchAndBook(page, doctorName, token, "سردرد خفیف (داده‌ی آزمون)");
  await expect(page.getByText("در انتظار پرداخت").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "پرداخت و نهایی‌سازی نوبت" })).toBeVisible();
});

test("۴) پرداخت sandbox ⇒ تأیید سمت سرور ⇒ در انتظار تأیید پزشک", async () => {
  await page.getByRole("link", { name: "پرداخت و نهایی‌سازی نوبت" }).click();
  await expect(page).toHaveURL(/\/payment\?appointmentId=/);
  await page.getByRole("button", { name: /^پرداخت/ }).click();
  // درگاه sandbox کاربر را به /payment/callback برمی‌گرداند؛ تأیید را سرور با درگاه انجام می‌دهد
  await expect(page.getByRole("heading", { name: "پرداخت موفق" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "مشاهده نوبت" }).click();
  await expect(page.getByText("در انتظار تأیید پزشک").first()).toBeVisible();
});

test("۵) چت بلادرنگ بیمار ↔ پزشک", async ({ browser, request }) => {
  const doctorCtx = await browser.newContext();
  const dPage = await doctorCtx.newPage();
  await loginViaUi(dPage, request, doctorPhone);

  // رکورد مکالمه هنگام رزرو ساخته شده است
  await page.goto("/chat");
  await page.getByRole("link", { name: new RegExp(doctorName) }).first().click();
  await dPage.goto("/chat");
  await dPage.getByRole("link", { name: /بیمار آزمون/ }).first().click();
  await expect(page.getByText("متصل", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(dPage.getByText("متصل", { exact: true })).toBeVisible({ timeout: 15_000 });

  const hello = `سلام ${token}`;
  await page.getByPlaceholder(/پیام بنویسید/).fill(hello);
  await page.getByPlaceholder(/پیام بنویسید/).press("Enter");
  await expect(dPage.getByText(hello)).toBeVisible(); // رسیدن بلادرنگ به پزشک

  const reply = `بفرمایید ${token}`;
  await dPage.getByPlaceholder(/پیام بنویسید/).fill(reply);
  await dPage.getByPlaceholder(/پیام بنویسید/).press("Enter");
  await expect(page.getByText(reply)).toBeVisible();

  await page.reload(); // تاریخچه از DB (ذخیره‌ی رمزنگاری‌شده، نمایش رمزگشایی‌شده)
  await expect(page.getByText(hello)).toBeVisible();
  await doctorCtx.close();
});
