import { defineConfig, devices } from "@playwright/test";

/**
 * تست بصری + axe روی Storybook ساخته‌شده (بدون API و دیتابیس).
 *   pnpm --filter @nobatyar/web build-storybook && pnpm --filter @nobatyar/e2e visual
 * baseline ها باید یک‌بار روی همان تصویر CI (لینوکس) ساخته و commit شوند: pnpm --filter @nobatyar/e2e visual:update
 */
export default defineConfig({
  testDir: "./visual",
  snapshotPathTemplate: "{testDir}/__snapshots__/{arg}{ext}",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  expect: { toHaveScreenshot: { animations: "disabled", maxDiffPixelRatio: 0.002 } },
  use: { baseURL: "http://localhost:6006", locale: "fa-IR", timezoneId: "Asia/Tehran", viewport: { width: 420, height: 800 }, colorScheme: "dark" },
  webServer: { command: "pnpm exec http-server ../web/storybook-static -p 6006 -s", url: "http://localhost:6006/iframe.html", reuseExistingServer: !process.env.CI, timeout: 30_000 },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 420, height: 800 } } }],
});
