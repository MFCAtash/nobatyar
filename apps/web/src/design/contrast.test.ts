import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** کنتراست WCAG 2.1 جفت‌رنگ‌های توکن (متن عادی ≥ ۴٫۵، متن درشت/اجزای UI ≥ ۳). پیش از axe و در سطح توکن. */
const tokens = JSON.parse(readFileSync(join(process.cwd(), "design/tokens.json"), "utf8")) as { color: Record<"dark" | "light", Record<string, string>> };

function rgba(c: string): [number, number, number, number] {
  if (c.startsWith("#")) { const h = c.length === 4 ? [...c.slice(1)].map((x) => x + x).join("") : c.slice(1); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1) as [number, number, number, number]; }
  const m = /rgba?\(([^)]+)\)/.exec(c)!; const p = m[1].split(",").map(Number); return [p[0], p[1], p[2], p[3] ?? 1];
}
const over = (fg: [number, number, number, number], bg: [number, number, number]): [number, number, number] => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])) as [number, number, number];
const lum = ([r, g, b]: number[]) => { const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
function ratio(fg: string, bg: string, under: string): number {
  const base = rgba(under).slice(0, 3) as [number, number, number];
  const back = over(rgba(bg), base);
  const front = over(rgba(fg), back);
  const [a, b] = [lum(front), lum(back)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

describe.each(["dark", "light"] as const)("token contrast (%s)", (theme) => {
  const c = tokens.color[theme];
  const surfaces: [string, string][] = [["black", c.black], ["panel", c.panel], ["glass-strong over black", c["glass-strong"]]];
  for (const [name, bg] of surfaces) {
    const under = name.startsWith("glass") ? c.black : bg;
    for (const fg of ["ink", "ink-soft", "muted", "teal", "red", "amber", "blue"]) {
      const need = 4.5;
      it(`${fg} on ${name} ≥ ${need}`, () => expect(ratio(c[fg], bg, under) >= need).toBe(true));
    }
  }
  it("on-accent text on teal button ≥ 4.5", () => expect(ratio(c["on-accent"], c.teal, c.black) >= 4.5).toBe(true));
  it("bubble text (ink) on my bubble ≥ 4.5", () => expect(ratio(c.ink, c["bubble-me"], c.black) >= 4.5).toBe(true));
});
