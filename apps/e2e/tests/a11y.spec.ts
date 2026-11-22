import { expect, test } from "@playwright/test";

type A11yReport = {
  total: number;
  byRule: Record<string, number>;
  examples: Record<string, Array<{ target: string; detail: string }>>;
};

/**
 * ممیز دسترسپذیری سبک و بدون وابستگی (همان منطق scripts/quality-a11y.mjs).
 * قوانین: نام دکمه/لینک، برچسب input، alt تصویر، lang ریشه، نبود tabindex مثبت.
 * عمداً از @axe-core/playwright استفاده نمیشود تا تست با صفر بستهٔใหม่ اجرا شود.
 */
function auditA11y(): A11yReport {
  const byRule: Record<string, number> = {};
  const examples: Record<string, Array<{ target: string; detail: string }>> = {};
  const MAX_EXAMPLES = 12;
  const describe = (el: Element): string => {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const cls = el.className && el.className.trim() ? `.${el.className.trim().split(/\s+/)[0]}` : "";
    const parent = el.parentElement;
    const siblings = parent ? Array.from(parent.children).filter((c) => c.tagName === el.tagName) : [el];
    return `${tag}${id}${cls}:nth-of-type(${siblings.indexOf(el) + 1})`;
  };
  const add = (rule: string, el: Element, detail: string): void => {
    byRule[rule] = (byRule[rule] || 0) + 1;
    if (!examples[rule]) examples[rule] = [];
    if (examples[rule].length < MAX_EXAMPLES) examples[rule].push({ target: describe(el), detail });
  };
  const refHasText = (ids: string): boolean =>
    ids.split(/\s+/).some((id) => {
      const ref = document.getElementById(id);
      return !!ref && !!(ref.textContent || "").trim();
    });
  const hasName = (el: Element): boolean => {
    if ((el.getAttribute("aria-label") || "").trim()) return true;
    if ((el.textContent || "").trim()) return true;
    const altImg = el.querySelector("img[alt]");
    if (altImg && (altImg.getAttribute("alt") || "").trim()) return true;
    const ids = (el.getAttribute("aria-labelledby") || "").trim();
    return !!ids && refHasText(ids);
  };
  const isLabelled = (el: HTMLInputElement): boolean => {
    if ((el.getAttribute("aria-label") || "").trim()) return true;
    if (el.labels && el.labels.length > 0) return true;
    const ids = (el.getAttribute("aria-labelledby") || "").trim();
    if (ids && refHasText(ids)) return true;
    const type = (el.getAttribute("type") || "text").toLowerCase();
    return ["submit", "button", "reset", "image"].includes(type) && !!(el.getAttribute("value") || "").trim();
  };

  if (!(document.documentElement.getAttribute("lang") || "").trim()) {
    add("html-lang", document.documentElement, "html فاقد lang است");
  }
  for (const el of Array.from(document.querySelectorAll("button, a"))) {
    if (!hasName(el)) add("accessible-name", el, `${el.tagName.toLowerCase()} فاقد متن/aria-label است`);
  }
  for (const el of Array.from(document.querySelectorAll("input"))) {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    if (type !== "hidden" && !isLabelled(el)) add("input-label", el, "input فاقد label/aria-label است");
  }
  for (const el of Array.from(document.querySelectorAll("img"))) {
    if (!el.hasAttribute("alt")) add("image-alt", el, "img فاقد alt است");
  }
  for (const el of Array.from(document.querySelectorAll("[tabindex]"))) {
    if (Number(el.getAttribute("tabindex")) > 0) {
      add("positive-tabindex", el, `tabindex=${el.getAttribute("tabindex")}`);
    }
  }

  const total = Object.values(byRule).reduce((sum, n) => sum + n, 0);
  return { total, byRule, examples };
}

/** ممیزی صفحههای عمومی روی برنامه واقعی (هر دو تم). تخلف بحرانی ⇒ شکست تست. */
const PAGES = ["/", "/login"];
for (const theme of ["dark", "light"] as const) {
  for (const path of PAGES) {
    test(`a11y ${path} [${theme}]`, async ({ page }) => {
      await page.addInitScript((t) => {
        try { localStorage.setItem("nvy-theme", t); } catch { /* ignore */ }
      }, theme);
      await page.goto(path);
      await page.locator("main").waitFor();
      const result = await page.evaluate(auditA11y);
      const problems = Object.entries(result.examples)
        .flatMap(([rule, items]) => items.map((i) => `${rule}: ${i.target} — ${i.detail}`));
      expect({ total: result.total, problems }).toEqual({ total: 0, problems: [] });
    });
  }
}
