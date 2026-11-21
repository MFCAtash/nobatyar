import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * نگهبان‌های کیفیت کد (بدون ESLint): کد تولیدی هیچ `any` ی صریح و هیچ خاموش‌کننده‌ی no-explicit-any ندارد؛
 * هر endpoint ی مالی (POST زیر payments/ و admin/refunds/) @Idempotent دارد.
 */
const API_SRC = join(process.cwd(), "src");
const ROOTS = [API_SRC, join(process.cwd(), "../../packages/shared/src"), join(process.cwd(), "../web/src")];

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n === ".next") continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}
const prod = ROOTS.flatMap((r) => walk(r)).filter((f) => !/\.(test|stories)\.tsx?$/.test(f) && !/(^|[\\/])(test|stories)[\\/]/.test(relative(process.cwd(), f)));
const ANY = /(:\s*any\b|<any>|\bas any\b|\bany\[\]|Array<any>|Record<string,\s*any>|=>\s*any\b|\(\s*any\s*\))/;
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

describe("code-quality guardrails", () => {
  it("scans a meaningful number of production files", () => expect(prod.length).toBeGreaterThan(100));

  it("no explicit `any` in production code", () => {
    const bad = prod.filter((f) => ANY.test(strip(readFileSync(f, "utf8")))).map((f) => relative(process.cwd(), f));
    expect(bad).toEqual([]);
  });

  it("nothing silences no-explicit-any / ts-ignore in production code", () => {
    const bad = prod.filter((f) => /eslint-disable[^\n]*no-explicit-any|@ts-ignore|@ts-nocheck/.test(readFileSync(f, "utf8"))).map((f) => relative(process.cwd(), f));
    expect(bad).toEqual([]);
  });

  it("every money-moving POST handler is @Idempotent", () => {
    const controllers = walk(API_SRC).filter((f) => /(payment\.controller|finance\.controller)\.ts$/.test(f));
    expect(controllers.length).toBe(2);
    const missing: string[] = [];
    for (const f of controllers) {
      const src = readFileSync(f, "utf8");
      // هر @Post(...) تا نام متد بعدی؛ باید @Idempotent( در همان بلوک بیاید
      for (const m of src.matchAll(/@Post\(([^)]*)\)([\s\S]*?)\n\s*(?:async\s+)?(\w+)\(/g)) {
        const route = m[1].replace(/["']/g, "");
        if (!/initiate|verify|refunds\//.test(route) && !/payment\.controller/.test(f)) continue;
        if (!m[2].includes("@Idempotent(")) missing.push(`${relative(process.cwd(), f)}: POST ${route} (${m[3]})`);
      }
    }
    expect(missing).toEqual([]);
  });
});
