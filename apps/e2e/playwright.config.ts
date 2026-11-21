import { defineConfig, devices } from "@playwright/test";

/**
 * E2E مسیرهای حیاتی: ورود با OTP، جستجو، رزرو، پرداخت (sandbox)، چت.
 * پیش‌نیاز: API با E2E_TEST_HOOKS=true، SMS_PROVIDER=memory و درگاه sandbox (پیش‌فرض غیر production) + وب روی E2E_BASE_URL.
 * CI: .github/workflows/ci.yml (job ی e2e-load). محلی: docs/testing-e2e-load.md
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // هر spec خودش داده‌ی یکتا می‌سازد ولی مسیر حیاتی ترتیبی است
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001",
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
    // اثر (trace/screenshot) ممکن است متن صفحه را شامل شود؛ فقط داده‌ی ساختگی آزمون است، ولی فقط در شکست نگه‌داری می‌شود
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: (process.env.E2E_CHANNEL as "chrome" | undefined) || undefined } }],
});
