import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loadStories, storyUrl, THEMES } from "./stories";

// axe روی هر story در هر دو تم (کنتراست رنگ در هر تم جدا بررسی می‌شود). تخلف «serious/critical» ⇒ شکست.
for (const theme of THEMES) {
  for (const s of loadStories()) {
    test(`a11y: ${s.title} / ${s.name} [${theme}]`, async ({ page }) => {
      await page.goto(storyUrl(s.id, theme));
      await page.locator("#storybook-root > *").first().waitFor();
      const r = await new AxeBuilder({ page }).include("#storybook-root").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).disableRules(["region"]).analyze();
      const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
    });
  }
}
