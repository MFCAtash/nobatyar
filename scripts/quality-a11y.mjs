#!/usr/bin/env node
/**
 * M15 — ممیزی دسترسپذیری سبک (بدون axe و بدون بستهٔ جدید).
 *
 * مسیرهای کلیدی را با Playwright موجود در apps/e2e باز میکند و درون صفحه DOM
 * را بررسی میکند: نام قابلدسترس برای دکمه/لینک، برچسب ورودی، alt تصویر، lang ریشه
 * و نبود tabindex مثبت. خروجی JSON و exit 1 فقط وقتی تخلف بحرانی > ۰ باشد.
 *
 * استفاده: node scripts/quality-a11y.mjs
 *          E2E_BASE_URL=https://... node scripts/quality-a11y.mjs
 */
import { createRequire } from "node:module";

const ROOT = (() => {
  const raw = decodeURIComponent(new URL("../", import.meta.url).pathname);
  return raw.replace(/^\/([A-Za-z]:)/, "$1").replace(/\/+$/, "");
})();
const BASE_URL = (process.env.E2E_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const DEFAULT_ROUTES = ["/", "/login", "/security", "/settings/preferences", "/triage/ruleset", "/health/record"];
const ROUTES = (process.env.E2E_ROUTES ?? DEFAULT_ROUTES.join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const requireFromE2E = createRequire(`${ROOT}/apps/e2e/package.json`);
const { chromium } = requireFromE2E("@playwright/test");

/**
 * ممیز سبکِ اجراشده درون صفحه. این همان منطقی است که در
 * apps/e2e/tests/a11y.spec.ts بهصورت inline تکرار شده است (بدون وابستگی).
 */
function auditA11y() {
  const byRule = {};
  const examples = {};
  const MAX_EXAMPLES = 12;

  const describe = (el) => {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const cls = typeof el.className === "string" && el.className.trim()
      ? `.${el.className.trim().split(/\s+/)[0]}`
      : "";
    const parent = el.parentElement;
    const siblings = parent ? [...parent.children].filter((c) => c.tagName === el.tagName) : [el];
    const nth = siblings.indexOf(el) + 1;
    return `${tag}${id}${cls}:nth-of-type(${nth})`;
  };
  const add = (rule, el, detail) => {
    byRule[rule] = (byRule[rule] || 0) + 1;
    if (!examples[rule]) examples[rule] = [];
    if (examples[rule].length < MAX_EXAMPLES) examples[rule].push({ target: describe(el), detail });
  };

  const hasName = (el) => {
    if ((el.getAttribute("aria-label") || "").trim()) return true;
    if ((el.textContent || "").trim()) return true;
    const altImg = el.querySelector("img[alt]");
    if (altImg && (altImg.getAttribute("alt") || "").trim()) return true;
    const ids = (el.getAttribute("aria-labelledby") || "").trim();
    return !!ids && ids.split(/\s+/).some((id) => {
      const ref = document.getElementById(id);
      return !!ref && !!(ref.textContent || "").trim();
    });
  };
  const isLabelled = (el) => {
    if ((el.getAttribute("aria-label") || "").trim()) return true;
    if (el.labels && el.labels.length > 0) return true;
    const ids = (el.getAttribute("aria-labelledby") || "").trim();
    if (ids && ids.split(/\s+/).some((id) => {
      const ref = document.getElementById(id);
      return !!ref && !!(ref.textContent || "").trim();
    })) return true;
    const type = (el.getAttribute("type") || "text").toLowerCase();
    return ["submit", "button", "reset", "image"].includes(type) && !!(el.getAttribute("value") || "").trim();
  };

  if (!(document.documentElement.getAttribute("lang") || "").trim()) {
    add("html-lang", document.documentElement, "html عنصر فاقد lang است");
  }
  for (const el of document.querySelectorAll("button, a")) {
    if (!hasName(el)) add("accessible-name", el, `${el.tagName.toLowerCase()} فاقد متن/aria-label است`);
  }
  for (const el of document.querySelectorAll("input")) {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    if (type === "hidden") continue;
    if (!isLabelled(el)) add("input-label", el, "input فاقد label/aria-label است");
  }
  for (const el of document.querySelectorAll("img")) {
    if (!el.hasAttribute("alt")) add("image-alt", el, "img فاقد alt است");
  }
  for (const el of document.querySelectorAll("[tabindex]")) {
    if (Number(el.getAttribute("tabindex")) > 0) {
      add("positive-tabindex", el, `tabindex=${el.getAttribute("tabindex")}`);
    }
  }

  const total = Object.values(byRule).reduce((sum, n) => sum + n, 0);
  return { total, byRule, examples };
}

const summary = {
  tool: "quality-a11y",
  generatedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  rules: ["html-lang", "accessible-name", "input-label", "image-alt", "positive-tabindex"],
  routes: [],
  criticalViolations: 0,
  ok: true,
};

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
    colorScheme: "dark",
  });

  for (const route of ROUTES) {
    const entry = { route, url: `${BASE_URL}${route}`, total: 0, byRule: {}, examples: {}, ok: false };
    try {
      const page = await context.newPage();
      await page.goto(entry.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
      const audit = await page.evaluate(auditA11y);
      await page.close();
      entry.total = audit.total;
      entry.byRule = audit.byRule;
      entry.examples = audit.examples;
      entry.ok = audit.total === 0;
      summary.criticalViolations += audit.total;
    } catch (error) {
      entry.error = String(error?.message ?? error);
      // خطای بارگذاری صفحه هم بهعنوان تخلف بحرانی ثبت میشود تا پنهان نماند.
      entry.total = 1;
      entry.byRule = { "page-load": 1 };
      summary.criticalViolations += 1;
    }
    summary.routes.push(entry);
  }
} catch (error) {
  summary.fatal = String(error?.message ?? error);
  summary.criticalViolations += 1;
  summary.routes.push({ route: "*", total: 1, byRule: { "browser-launch": 1 }, ok: false });
} finally {
  if (browser) await browser.close().catch(() => undefined);
}

summary.ok = summary.criticalViolations === 0;
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.ok ? 0 : 1);
