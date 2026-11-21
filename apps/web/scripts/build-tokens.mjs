#!/usr/bin/env node
/**
 * ساخت توکن‌ها و کلاس‌های utility از design/tokens.json.
 *   node scripts/build-tokens.mjs          ⇒ فایل‌ها را بازنویسی می‌کند
 *   node scripts/build-tokens.mjs --check  ⇒ اگر فایل‌های ساخته‌شده کهنه باشند با کد ۱ خارج می‌شود (برای CI)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const t = JSON.parse(readFileSync(resolve(root, "design/tokens.json"), "utf8"));
const check = process.argv.includes("--check");
const HEADER = "/* ⚠️ خودکار از design/tokens.json ساخته شده؛ دستی ویرایش نکنید (pnpm --filter @nobatyar/web tokens). */\n";

const decl = (o, prefix = "") => Object.entries(o).map(([k, v]) => `  --${prefix}${k}: ${v};`).join("\n");

// ── tokens.css ──
const px = (n) => (n === 0 ? "0" : `${n}px`);
const shared = [
  decl(Object.fromEntries(Object.entries(t.space).map(([k, v]) => [k, px(v)])), "space-"),
  decl(t.radius, "radius-"),
  decl(t.fontSize, "fs-"),
  decl(t.fontWeight, "fw-"),
  decl(t.lineHeight, "lh-"),
  decl(t.measure, "measure-"),
  decl(t.z, "z-"),
  decl(t.duration, "dur-"),
  decl(t.ease, "ease-"),
  decl(t.font, "font-"),
].join("\n");
const LIGHT_THEMES = new Set(["light", "clinical-light", "calm-teal", "senior", "low-bandwidth"]);
const themeBlock = (name, colors) => `[data-theme="${name}"] {
${decl(colors)}
${decl(t.shadow[LIGHT_THEMES.has(name) ? "light" : "dark"], "shadow-")}
  color-scheme: ${LIGHT_THEMES.has(name) ? "light" : "dark"};
}`;
const themeBlocks = Object.entries(t.themes ?? {}).map(([name, colors]) => themeBlock(name, colors)).join("\n");
const modifierBlocks = Object.entries(t.modifiers ?? {}).flatMap(([kind, values]) =>
  Object.entries(values).map(([name, vars]) => `[data-${kind === "fontScale" ? "font-scale" : kind}="${name}"] {\n${decl(vars)}\n}`)).join("\n");

const tokensCss = `${HEADER}@layer tokens {
:root {
${decl(t.color.dark)}
${decl(t.shadow.dark, "shadow-")}
${shared}
  /* نام‌های قدیمی (سازگاری با CSS موجود) */
  --fs-h1: clamp(1.8rem, 3vw, 2.6rem); --fs-h2: clamp(1.4rem, 2.2vw, 1.9rem); --fs-h3: clamp(1.1rem, 1.6vw, 1.35rem);
  --fs-small: var(--fs-sm);
  color-scheme: dark;
}
${themeBlock("light", t.color.light)}
${themeBlocks}
${modifierBlocks}
}
`;

// ── utilities.css ──
const U = [];
const rule = (sel, body) => U.push(`.${sel} { ${body} }`);
const spaceKeys = Object.keys(t.space);
for (const k of spaceKeys) {
  const v = `var(--space-${k})`;
  rule(`m-${k}`, `margin: ${v};`);
  rule(`mt-${k}`, `margin-top: ${v};`); rule(`mb-${k}`, `margin-bottom: ${v};`);
  rule(`ms-${k}`, `margin-inline-start: ${v};`); rule(`me-${k}`, `margin-inline-end: ${v};`);
  rule(`p-${k}`, `padding: ${v};`);
  rule(`px-${k}`, `padding-inline: ${v};`); rule(`py-${k}`, `padding-block: ${v};`);
  rule(`gap-${k}`, `gap: ${v};`);
}
rule("mx-auto", "margin-inline: auto;");
for (const k of Object.keys(t.fontSize)) rule(`fs-${k}`, `font-size: var(--fs-${k});`);
for (const k of Object.keys(t.fontWeight)) rule(`fw-${k}`, `font-weight: var(--fw-${k});`);
for (const k of Object.keys(t.lineHeight)) rule(`lh-${k}`, `line-height: var(--lh-${k});`);
for (const k of Object.keys(t.measure)) rule(`mw-${k}`, `max-width: var(--measure-${k});`);
for (const [k, c] of Object.entries({ ink: "ink", soft: "ink-soft", muted: "muted", accent: "teal", danger: "red", warn: "amber", info: "blue" })) rule(`text-${k}`, `color: var(--${c});`);
const statics = {
  flex: "display: flex;", "flex-col": "display: flex; flex-direction: column;", "inline-flex": "display: inline-flex;",
  grid: "display: grid;", block: "display: block;", hidden: "display: none;",
  "flex-wrap": "flex-wrap: wrap;", "flex-1": "flex: 1;", "shrink-0": "flex-shrink: 0;", "min-w-0": "min-width: 0;",
  "items-center": "align-items: center;", "items-start": "align-items: flex-start;", "items-end": "align-items: flex-end;",
  "justify-between": "justify-content: space-between;", "justify-center": "justify-content: center;", "justify-end": "justify-content: flex-end;",
  "self-start": "align-self: flex-start;", relative: "position: relative;", "w-full": "width: 100%;",
  "overflow-x-auto": "overflow-x: auto;", "ws-pre-wrap": "white-space: pre-wrap;", "break-words": "word-break: break-word;",
  "text-start": "text-align: start;", "text-end": "text-align: end;", "text-center": "text-align: center;",
  "list-inset": "padding-inline-start: var(--space-5);", "reset-btn": "background: none; border: 0; padding: 0; font: inherit; color: inherit; cursor: pointer;",
};
for (const [k, v] of Object.entries(statics)) rule(k, v);
const utilitiesCss = `${HEADER}/* لایه‌ی utilities آخرین لایه است؛ بدون توجه به specificity بر کامپوننت‌ها غلبه می‌کند (مثل style inline، ولی قابل‌بازبینی). */\n@layer utilities {\n${U.join("\n")}\n}\n`;

// ── tokens.generated.ts ──
const ts = `${HEADER.replace("/*", "/**").replace("*/", "*/")}export const tokens = ${JSON.stringify(
  { color: t.color, themes: t.themes ?? {}, modifiers: t.modifiers ?? {}, space: t.space, radius: t.radius, fontSize: t.fontSize, fontWeight: t.fontWeight, measure: t.measure },
  null, 2,
)} as const;\n\nexport const utilityNames = ${JSON.stringify(U.map((r) => r.slice(1, r.indexOf(" "))), null, 0)} as const;\n`;

const outputs = {
  "src/styles/generated/tokens.css": tokensCss,
  "src/styles/generated/utilities.css": utilitiesCss,
  "src/design/tokens.generated.ts": ts,
};

let stale = false;
for (const [rel, content] of Object.entries(outputs)) {
  const p = resolve(root, rel);
  if (check) {
    if (!existsSync(p) || readFileSync(p, "utf8") !== content) { console.error(`✗ کهنه: ${rel}`); stale = true; }
  } else {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
    console.log(`✓ ${rel}`);
  }
}
if (check) {
  if (stale) { console.error("→ pnpm --filter @nobatyar/web tokens را بزنید و نتیجه را commit کنید."); process.exit(1); }
  console.log("tokens: به‌روز است");
}
