import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const THEMES = ["dark", "light"] as const;
export interface StoryEntry { id: string; title: string; name: string }

/** فهرست stories از index.json ی ساخته‌شده؛ بدون آن (build نشده) پیام روشن می‌دهد. */
export function loadStories(): StoryEntry[] {
  const file = resolve(__dirname, "../../web/storybook-static/index.json");
  let raw: string;
  try { raw = readFileSync(file, "utf8"); } catch { throw new Error("storybook-static/index.json پیدا نشد؛ ابتدا pnpm --filter @nobatyar/web build-storybook را بزنید."); }
  const entries = (JSON.parse(raw) as { entries: Record<string, StoryEntry & { type: string }> }).entries;
  return Object.values(entries).filter((e) => e.type === "story").map(({ id, title, name }) => ({ id, title, name }));
}

export const storyUrl = (id: string, theme: (typeof THEMES)[number]) => `/iframe.html?id=${encodeURIComponent(id)}&viewMode=story&globals=theme:${theme}`;
