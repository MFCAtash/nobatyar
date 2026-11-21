import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * نگهبان‌های معماری UI (علاوه بر ESLint؛ این تست بدون plugin هم اجرا می‌شود):
 *  ۱) هیچ style ی inline جز cssVars(...)   ۲) Intl/toLocale فقط در lib/format.ts   ۳) هیچ کلاس u-… ی قدیمی
 */
const SRC = join(process.cwd(), "src");
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}
const files = walk(SRC).filter((f) => !/\.(test|stories)\.tsx?$/.test(f) && !f.includes(`${join("design", "tokens.generated")}`));
const rel = (f: string) => relative(SRC, f).split("\\").join("/");

describe("UI guardrails", () => {
  it("has no inline style except cssVars()", () => {
    const bad = files.filter((f) => /style=\{(?!cssVars\()/.test(readFileSync(f, "utf8"))).map(rel);
    expect(bad).toEqual([]);
  });
  it("uses Intl / toLocale* only inside lib/format.ts", () => {
    const bad = files.filter((f) => rel(f) !== "lib/format.ts" && /\bIntl\.|\.toLocale(Date|Time)?String\(/.test(readFileSync(f, "utf8"))).map(rel);
    expect(bad).toEqual([]);
  });
  it("uses no legacy u-* utility classes", () => {
    const bad = files.filter((f) => /className="[^"]*\bu-[a-z]/.test(readFileSync(f, "utf8"))).map(rel);
    expect(bad).toEqual([]);
  });
  it("every utility class used in TSX exists in the generated utilities or a stylesheet", () => {
    const css = readdirSync(join(SRC, "styles")).filter((n) => n.endsWith(".css")).map((n) => readFileSync(join(SRC, "styles", n), "utf8"))
      .concat(readFileSync(join(SRC, "styles/generated/utilities.css"), "utf8")).join("\n");
    const used = new Set<string>();
    for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(/className="([^"{}$]+)"/g)) m[1].split(/\s+/).filter(Boolean).forEach((c) => used.add(c));
    const unknown = [...used].filter((c) => !new RegExp(`\\.${c.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}(?![\\w-])`).test(css));
    // کلاس‌هایی که عمداً فقط برچسب‌اند یا در globals/other CSS تعریف‌شده‌اند
    expect(unknown).toEqual([]);
  });
});
