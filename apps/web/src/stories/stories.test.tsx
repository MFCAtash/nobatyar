import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

/**
 * «دودآزمون» Storybook بدون مرورگر: هر story با React سمت سرور رندر می‌شود تا
 * خطای import/props/رندر و متن‌های خراب (undefined / NaN / [object]) پیش از Storybook و CI بصری گرفته شود.
 */
function findStories(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) findStories(p, out); else if (n.endsWith(".stories.tsx")) out.push(p);
  }
  return out;
}

interface Meta { title: string; component?: unknown; args?: Record<string, unknown> }
interface Story { args?: Record<string, unknown>; render?: (args: Record<string, unknown>, ctx: unknown) => unknown }

const files = findStories(join(process.cwd(), "src"));

describe("stories render", () => {
  it("finds stories", () => expect(files.length).toBeGreaterThan(5));
  for (const file of files) {
    it(file.slice(process.cwd().length + 5), async () => {
      const mod = (await import(/* @vite-ignore */ file)) as Record<string, unknown> & { default: Meta };
      const meta = mod.default;
      const names = Object.keys(mod).filter((k) => k !== "default");
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) {
        const story = mod[name] as Story;
        const args = { ...(meta.args ?? {}), ...(story.args ?? {}) };
        const el = (story.render ? story.render(args, {}) : createElement(meta.component as never, args)) as never;
        const html = renderToStaticMarkup(el);
        const text = html.replace(/<[^>]+>/g, " ");
        expect(html.length, `${meta.title}/${name}`).toBeGreaterThan(0);
        expect(text, `${meta.title}/${name}`).not.toMatch(/undefined|NaN|\[object/);
      }
    });
  }
});
