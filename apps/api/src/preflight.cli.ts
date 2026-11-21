/* اجرا: node dist/preflight.cli.js .env.production   (کد خروج ۱ = خطا ⇒ استقرار نکنید) */
import { readFileSync } from "node:fs";
import { parseDotenv, runPreflight } from "./config/preflight";

const file = process.argv[2];
if (!file) { console.error("usage: preflight <env-file>"); process.exit(2); }
const r = runPreflight(parseDotenv(readFileSync(file, "utf8")));
for (const e of r.errors) console.error(`✗ ${e}`);
for (const w of r.warnings) console.warn(`⚠ ${w}`);
for (const i of r.info) console.log(`ℹ ${i}`);
console.log(r.errors.length ? `\nپیش‌پرواز ناموفق: ${r.errors.length} خطا` : "\nپیش‌پرواز موفق ✓ (هشدارها را بررسی کنید)");
process.exit(r.errors.length ? 1 : 0);
