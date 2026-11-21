import { expect, test } from "@playwright/test";
import { loadStories, storyUrl, THEMES } from "./stories";

// هر story در هر دو تم (تیره/روشن) — جهت RTL و فونت فارسی از preview.tsx می‌آید.
for (const theme of THEMES) {
  for (const s of loadStories()) {
    test(`visual: ${s.title} / ${s.name} [${theme}]`, async ({ page }) => {
      await page.goto(storyUrl(s.id, theme));
      await page.locator("#storybook-root > *").first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.dir)).toBe("rtl");
      await expect(page).toHaveScreenshot(`${s.id}--${theme}.png`, { fullPage: true });
    });
  }
}
