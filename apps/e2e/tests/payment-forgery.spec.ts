import { expect, test } from "@playwright/test";
import { loginViaUi, randomPhone, searchAndBook, seedDoctor, uniq } from "../helpers/api";

/**
 * «پارامتر Status مرورگر را باور نکن»: بازگشت جعلی از درگاه (Status=OK با Authority ی ساختگی)
 * هرگز نباید پرداخت را تأیید کند و نوبت باید «در انتظار پرداخت» بماند.
 */
test("بازگشت جعلی Status=OK پرداخت را تأیید نمی‌کند", async ({ page, request }) => {
  const token = uniq();
  const name = `دکتر ${token}`;
  await seedDoctor(request, { fullName: name });
  await loginViaUi(page, request, randomPhone(), "بیمار جعل");
  const path = await searchAndBook(page, name, token);
  const id = path.split("/").pop()!;

  await page.goto(`/payment/callback?appointmentId=${id}&Authority=SANDBOX-00000000-0000-0000-0000-000000000000&Status=OK`);
  await expect(page.getByRole("heading", { name: "پرداخت موفق" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "تلاش مجدد" })).toBeVisible({ timeout: 15_000 });

  await page.goto(`/appointments/${id}`);
  await expect(page.getByText("در انتظار پرداخت").first()).toBeVisible();
});
