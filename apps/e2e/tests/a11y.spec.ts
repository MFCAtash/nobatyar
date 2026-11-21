import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** ممیزی دسترس‌پذیری صفحه‌های عمومی روی برنامه‌ی واقعی (هر دو تم). صفحه‌های واردشده را مسیر حیاتی (critical-path) پوشش می‌دهد. */
const PAGES = ["/", "/login"];
for (const theme of ["dark", "light"] as const) {
  for (const path of PAGES) {
    test(`axe ${path} [${theme}]`, async ({ page }) => {
      await page.addInitScript((t) => { try { localStorage.setItem("nvy-theme", t); } catch { /* ignore */ } }, theme);
      await page.goto(path);
      await page.locator("main").waitFor();
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
    });
  }
}
