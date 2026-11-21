/**
 * تولید/بررسی openapi/openapi.json:
 *   pnpm --filter @nobatyar/api openapi         ⇒ بازنویسی فایل
 *   pnpm --filter @nobatyar/api openapi:check   ⇒ اگر فایل با سند فعلی نخواند، با کد ۱ خارج می‌شود (CI)
 * (reflect-metadata لازم است چون registry ماژول‌های دارای decorator را import می‌کند.)
 * سپس client ی تایپ‌شده‌ی فرانت از همین فایل ساخته می‌شود (apps/web/scripts/gen-api-types.mjs).
 */
import "reflect-metadata";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildDocument } from "./build-document";

const out = resolve(__dirname, "../../openapi/openapi.json");
const text = `${JSON.stringify(buildDocument(), null, 2)}\n`;

if (process.argv.includes("--check")) {
  let cur = "";
  try { cur = readFileSync(out, "utf8"); } catch { /* نبودن فایل = کهنه */ }
  if (cur !== text) { console.error("✗ openapi/openapi.json کهنه است ⇒ pnpm --filter @nobatyar/api openapi را بزنید و commit کنید."); process.exit(1); }
  console.log("openapi: به‌روز است");
} else {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, text);
  console.log(`✓ ${out}`);
}
