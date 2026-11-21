import { expect, test } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { loginViaUi, randomPhone, searchAndBook, seedDoctor, uniq } from "../helpers/api";

/**
 * ظ…ط³غŒط± ط­غŒط§طھغŒ آ«ط§ط² ظˆط±ظˆط¯ طھط§ ع¯ظپطھع¯ظˆآ» â€” طھط±طھغŒط¨غŒطŒ ط±ظˆغŒ غŒع© ط¨غŒظ…ط§ط±/ظ¾ط²ط´ع©/ظ†ظˆط¨طھ:
 *   غ±) ظˆط±ظˆط¯ ط¨ط§ OTP (ظˆ ط«ط¨طھâ€Œظ†ط§ظ…)   غ²) ط¬ط³طھط¬ظˆ   غ³) ط±ط²ط±ظˆ   غ´) ظ¾ط±ط¯ط§ط®طھ sandbox   غµ) ع†طھ ط¯ظˆط·ط±ظپظ‡ (ط¨ظ„ط§ط¯ط±ظ†ع¯)
 */
test.describe.configure({ mode: "serial" });

const token = uniq();
const doctorName = `ط¯ع©طھط± ${token}`;
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

test("غ±) ظˆط±ظˆط¯ ط¨ط§ OTP ظˆ ط«ط¨طھâ€Œظ†ط§ظ… ط¨غŒظ…ط§ط±", async ({ request }) => {
  await loginViaUi(page, request, patientPhone, "ط¨غŒظ…ط§ط± ط¢ط²ظ…ظˆظ†");
});

test("غ±-ط¨) ع©ط¯ ط§ط´طھط¨ط§ظ‡ ط±ط¯ ظ…غŒâ€Œط´ظˆط¯ ظˆ ظˆط±ظˆط¯ ط§ظ†ط¬ط§ظ… ظ†ظ…غŒâ€Œط´ظˆط¯", async ({ browser }) => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto("/login");
  await p.getByLabel("ط´ظ…ط§ط±ظ‡â€ŒغŒ ظ…ظˆط¨ط§غŒظ„").fill(randomPhone());
  await p.getByRole("button", { name: "ط¯ط±غŒط§ظپطھ ع©ط¯ طھط£غŒغŒط¯" }).click();
  await p.locator('input[autocomplete="one-time-code"]').fill("000000");
  await p.locator("form button.btn-primary").last().click({ force: true });
  await expect(p.getByText(/ظ†ط§ط¯ط±ط³طھ غŒط§ ظ…ظ†ظ‚ط¶غŒ/)).toBeVisible();
  await expect(p).toHaveURL(/\/login/);
  await ctx.close();
});

test("غ²) ط¬ط³طھط¬ظˆغŒ ظ¾ط²ط´ع© ظˆ غ³) ط±ط²ط±ظˆ â‡’ ط¯ط± ط§ظ†طھط¸ط§ط± ظ¾ط±ط¯ط§ط®طھ", async () => {
  await searchAndBook(page, doctorName, token, "ط³ط±ط¯ط±ط¯ ط®ظپغŒظپ (ط¯ط§ط¯ظ‡â€ŒغŒ ط¢ط²ظ…ظˆظ†)");
  await expect(page.getByText("ط¯ط± ط§ظ†طھط¸ط§ط± ظ¾ط±ط¯ط§ط®طھ").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "ظ¾ط±ط¯ط§ط®طھ ظˆ ظ†ظ‡ط§غŒغŒâ€Œط³ط§ط²غŒ ظ†ظˆط¨طھ" })).toBeVisible();
});

test("غ´) ظ¾ط±ط¯ط§ط®طھ sandbox â‡’ طھط£غŒغŒط¯ ط³ظ…طھ ط³ط±ظˆط± â‡’ ط¯ط± ط§ظ†طھط¸ط§ط± طھط£غŒغŒط¯ ظ¾ط²ط´ع©", async () => {
  await page.getByRole("link", { name: "ظ¾ط±ط¯ط§ط®طھ ظˆ ظ†ظ‡ط§غŒغŒâ€Œط³ط§ط²غŒ ظ†ظˆط¨طھ" }).click();
  await expect(page).toHaveURL(/\/payment\?appointmentId=/);
  await page.getByRole("button", { name: /^ظ¾ط±ط¯ط§ط®طھ/ }).click();
  // ط¯ط±ع¯ط§ظ‡ sandbox ع©ط§ط±ط¨ط± ط±ط§ ط¨ظ‡ /payment/callback ط¨ط±ظ…غŒâ€Œع¯ط±ط¯ط§ظ†ط¯ط› طھط£غŒغŒط¯ ط±ط§ ط³ط±ظˆط± ط¨ط§ ط¯ط±ع¯ط§ظ‡ ط§ظ†ط¬ط§ظ… ظ…غŒâ€Œط¯ظ‡ط¯
  await expect(page.getByRole("heading", { name: "ظ¾ط±ط¯ط§ط®طھ ظ…ظˆظپظ‚" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "ظ…ط´ط§ظ‡ط¯ظ‡ ظ†ظˆط¨طھ" }).click();
  await expect(page.getByText("ط¯ط± ط§ظ†طھط¸ط§ط± طھط£غŒغŒط¯ ظ¾ط²ط´ع©").first()).toBeVisible();
});

test("غµ) ع†طھ ط¨ظ„ط§ط¯ط±ظ†ع¯ ط¨غŒظ…ط§ط± â†” ظ¾ط²ط´ع©", async ({ browser, request }) => {
  const doctorCtx = await browser.newContext();
  const dPage = await doctorCtx.newPage();
  await loginViaUi(dPage, request, doctorPhone);

  // ط±ع©ظˆط±ط¯ ظ…ع©ط§ظ„ظ…ظ‡ ظ‡ظ†ع¯ط§ظ… ط±ط²ط±ظˆ ط³ط§ط®طھظ‡ ط´ط¯ظ‡ ط§ط³طھ
  await page.goto("/chat");
  await page.getByRole("link", { name: new RegExp(doctorName) }).first().click();
  await dPage.goto("/chat");
  await dPage.getByRole("link", { name: /ط¨غŒظ…ط§ط± ط¢ط²ظ…ظˆظ†/ }).first().click();
  await expect(page.getByText("ظ…طھطµظ„", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(dPage.getByText("ظ…طھطµظ„", { exact: true })).toBeVisible({ timeout: 15_000 });

  const hello = `ط³ظ„ط§ظ… ${token}`;
  await page.getByPlaceholder(/ظ¾غŒط§ظ… ط¨ظ†ظˆغŒط³غŒط¯/).fill(hello);
  await page.getByPlaceholder(/ظ¾غŒط§ظ… ط¨ظ†ظˆغŒط³غŒط¯/).press("Enter");
  await expect(dPage.getByText(hello)).toBeVisible(); // ط±ط³غŒط¯ظ† ط¨ظ„ط§ط¯ط±ظ†ع¯ ط¨ظ‡ ظ¾ط²ط´ع©

  const reply = `ط¨ظپط±ظ…ط§غŒغŒط¯ ${token}`;
  await dPage.getByPlaceholder(/ظ¾غŒط§ظ… ط¨ظ†ظˆغŒط³غŒط¯/).fill(reply);
  await dPage.getByPlaceholder(/ظ¾غŒط§ظ… ط¨ظ†ظˆغŒط³غŒط¯/).press("Enter");
  await expect(page.getByText(reply)).toBeVisible();

  await page.reload(); // طھط§ط±غŒط®ع†ظ‡ ط§ط² DB (ط°ط®غŒط±ظ‡â€ŒغŒ ط±ظ…ط²ظ†ع¯ط§ط±غŒâ€Œط´ط¯ظ‡طŒ ظ†ظ…ط§غŒط´ ط±ظ…ط²ع¯ط´ط§غŒغŒâ€Œط´ط¯ظ‡)
  await expect(page.getByText(hello)).toBeVisible();
  await doctorCtx.close();
});
