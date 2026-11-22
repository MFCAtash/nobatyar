#!/usr/bin/env node
/**
 * M12 — بررسی بصری سبک/ساده با Playwright موجود در apps/e2e (بدون pixelmatch).
 *
 * مسیرهای کلیدی را باز میکند، اسکرینشات میگیرد و با baselineهای ذخیرهشده در
 * apps/e2e/visual-baselines/ مقایسه میکند. مقایسه برابرای بایت/هش SHA-256 است.
 * نخستین اجرایی که baseline وجود ندارد، آن را مینویسد و شکست نمیدهد.
 *
 * استفاده:
 *   node scripts/quality-visual.mjs
 *   E2E_BASE_URL=https://... node scripts/quality-visual.mjs
 *   E2E_ROUTES=/,/login node scripts/quality-visual.mjs   # اختیاری
 *
 * خروجی: JSON روی stdout؛ exit 1 فقط در صورت تفاوت یا خطا.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const ROOT = (() => {
  const raw = decodeURIComponent(new URL("../", import.meta.url).pathname);
  return raw.replace(/^\/([A-Za-z]:)/, "$1").replace(/\/+$/, "");
})();
const BASELINE_DIR = `${ROOT}/apps/e2e/visual-baselines`;
const BASE_URL = (process.env.E2E_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const DEFAULT_ROUTES = ["/", "/login", "/security", "/settings/preferences", "/triage/ruleset", "/health/record"];
const ROUTES = (process.env.E2E_ROUTES ?? DEFAULT_ROUTES.join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// @playwright/test در apps/e2e نصب است؛ از همانجا (بدون نصب بستهٔ جدید) بارگذاری میشود.
const requireFromE2E = createRequire(`${ROOT}/apps/e2e/package.json`);
const { chromium } = requireFromE2E("@playwright/test");

const slug = (route) =>
  route.replace(/^\/+/, "").replace(/[^a-zA-Z0-9-]+/g, "_").replace(/^_+|_+$/g, "") || "root";
const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");

const summary = {
  tool: "quality-visual",
  generatedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  comparison: "sha256-byte-equality",
  viewport: { width: 1280, height: 800 },
  baselineDir: BASELINE_DIR.replace(`${ROOT}/`, ""),
  routes: [],
  counts: { created: 0, matched: 0, differing: 0, errors: 0 },
  ok: true,
};

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  });
  const context = await browser.newContext({
    viewport: summary.viewport,
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
    colorScheme: "dark",
  });
  mkdirSync(BASELINE_DIR, { recursive: true });

  for (const route of ROUTES) {
    const entry = { route, url: `${BASE_URL}${route}`, status: "error", baseline: null };
    try {
      const page = await context.newPage();
      await page.goto(entry.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
      const shot = await page.screenshot({ animations: "disabled" });
      await page.close();

      const baselineName = `${slug(route)}.png`;
      const baselinePath = `${BASELINE_DIR}/${baselineName}`;
      entry.baseline = `apps/e2e/visual-baselines/${baselineName}`;
      entry.sha256 = sha(shot);
      entry.bytes = shot.length;

      if (!existsSync(baselinePath)) {
        writeFileSync(baselinePath, shot);
        entry.status = "baseline created";
        summary.counts.created += 1;
      } else {
        const baseline = readFileSync(baselinePath);
        entry.baselineSha256 = sha(baseline);
        entry.status = entry.sha256 === entry.baselineSha256 ? "match" : "diff";
        summary.counts[entry.status === "match" ? "matched" : "differing"] += 1;
      }
    } catch (error) {
      entry.status = "error";
      entry.error = String(error?.message ?? error);
      summary.counts.errors += 1;
    }
    summary.routes.push(entry);
  }
} catch (error) {
  summary.counts.errors += 1;
  summary.fatal = String(error?.message ?? error);
} finally {
  if (browser) await browser.close().catch(() => undefined);
}

summary.ok = summary.counts.errors === 0 && summary.counts.differing === 0;
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.ok ? 0 : 1);
