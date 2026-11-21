import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * اسکنر ایستای کنترلرها: لیست «METHOD /path» ی واقعی را از روی @Controller/@Get/@Post/… می‌سازد.
 * هدف: مستندات OpenAPI نه می‌تواند به مسیر ناموجود اشاره کند، نه مسیر جدیدی بدون مستند (ratchet) بماند.
 */
export interface ScannedRoute { method: "get" | "post" | "patch" | "put" | "delete"; path: string; file: string; handler: string }

const walk = (dir: string, out: string[] = []): string[] => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else if (n.endsWith(".controller.ts")) out.push(p);
  }
  return out;
};

const norm = (...parts: string[]): string => "/" + parts.join("/").split("/").filter(Boolean).join("/");
/** :id ⇒ {id} (قالب OpenAPI) */
export const toOpenApiPath = (p: string): string => p.replace(/:([A-Za-z0-9_]+)/g, "{$1}");

export function scanControllers(srcDir: string): ScannedRoute[] {
  const routes: ScannedRoute[] = [];
  for (const file of walk(srcDir)) {
    const src = readFileSync(file, "utf8");
    // یک فایل ممکن است چند @Controller داشته باشد (مثل specialties + doctors): هر بخش با پیشوند خودش
    const heads = [...src.matchAll(/@Controller\(\s*(?:"([^"]*)"|'([^']*)')?\s*\)/g)];
    const segments = heads.length ? heads.map((h, i) => ({ prefix: h[1] ?? h[2] ?? "", text: src.slice(h.index ?? 0, heads[i + 1]?.index ?? src.length) })) : [{ prefix: "", text: src }];
    for (const seg of segments) {
      for (const m of seg.text.matchAll(/@(Get|Post|Patch|Put|Delete)\(\s*(?:"([^"]*)"|'([^']*)')?\s*\)([\s\S]*?)\n\s*(?:async\s+)?(\w+)\s*\(/g)) {
        routes.push({ method: m[1].toLowerCase() as ScannedRoute["method"], path: toOpenApiPath(norm(seg.prefix, m[2] ?? m[3] ?? "")), file: file.slice(srcDir.length + 1), handler: m[5] });
      }
    }
  }
  return routes.sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
}

export const routeKey = (r: { method: string; path: string }): string => `${r.method.toUpperCase()} ${r.path}`;
