#!/usr/bin/env node
/**
 * M12 — SBOM سبک CycloneDX بدون وابستگی و بدون شبکه.
 *
 * فایل `pnpm-lock.yaml` را متنی (regex) میخواند، بستههای قفلشده (بخش packages)
 * را استخراج میکند و فهرست name/version را به صورت CycloneDX-like در
 * docs/sbom.json مینویسد. نام/نسخهٔ ریشه از package.json خوانده میشود.
 *
 * استفاده: node scripts/quality-sbom.mjs
 * خروجی: JSON حاوی تعداد کامپوننتها روی stdout.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const ROOT = (() => {
  const raw = decodeURIComponent(new URL("../", import.meta.url).pathname);
  return raw.replace(/^\/([A-Za-z]:)/, "$1").replace(/\/+$/, "");
})();
const OUTPUT = `${ROOT}/docs/sbom.json`;

const lockText = readFileSync(`${ROOT}/pnpm-lock.yaml`, "utf8");
const rootPkg = JSON.parse(readFileSync(`${ROOT}/package.json`, "utf8"));
const lines = lockText.split(/\r?\n/);

// فقط بخش «packages» قفل؛ از «snapshots»/«importers» صرفنظر میشود تا دوبل نشود.
const start = lines.findIndex((line) => /^packages:\s*$/.test(line));
const after = lines.findIndex((line, i) => i > start && /^(snapshots|importers):\s*$/.test(line));
const section = start < 0 ? lines : lines.slice(start + 1, after < 0 ? undefined : after);

const components = new Map();
const add = (name, version, direct) => {
  if (!name || !version || version.includes("/")) return;
  const key = `${name}@${version}`;
  if (components.has(key)) return;
  const purlName = name.startsWith("@") ? `%40${name.slice(1)}` : name;
  components.set(key, {
    type: "library",
    "bom-ref": `pkg:npm/${purlName}@${version}`,
    name,
    version,
    purl: `pkg:npm/${purlName}@${version}`,
    ...(direct ? { properties: [{ name: "pnpm:direct", value: "true" }] } : {}),
  });
};

for (const line of section) {
  // کلیدهای قفل با دوتا فاصله آغاز میشوند و با «:» تمام میشوند؛ مثلاً:
  //   '@aws-sdk/client-s3@3.1175.0':
  //   '@nestjs/common@10.4.22(reflect-metadata@0.2.2)(rxjs@7.8.2)':
  const match = /^  (.+):\s*$/.exec(line);
  if (!match) continue;
  const key = match[1].trim().replace(/^['"]|['"]$/g, "").replace(/\(.*$/, "");
  const at = key.lastIndexOf("@");
  if (at <= 0) continue;
  add(key.slice(0, at), key.slice(at + 1), false);
}

// root package.json: کامپوننت ریشه + علامتگذاری وابستگیهای مستقیم (بدون حدس نسخه).
const declared = new Set([
  ...Object.keys(rootPkg.dependencies ?? {}),
  ...Object.keys(rootPkg.devDependencies ?? {}),
]);
for (const component of components.values()) {
  if (declared.has(component.name)) {
    component.properties = [{ name: "pnpm:direct", value: "true" }];
  }
}

const sorted = [...components.values()].sort(
  (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
);
const bom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  serialNumber: `urn:uuid:${randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: [{ vendor: "nobatyar", name: "quality-sbom", version: "1.0.0" }],
    component: {
      type: "application",
      "bom-ref": `pkg:npm/${rootPkg.name ?? "root"}@${rootPkg.version ?? "0.0.0"}`,
      name: rootPkg.name ?? "root",
      version: rootPkg.version ?? "0.0.0",
    },
  },
  components: sorted,
};

mkdirSync(`${ROOT}/docs`, { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify(bom, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  tool: "quality-sbom",
  output: OUTPUT.replace(`${ROOT}/`, ""),
  root: `${rootPkg.name ?? "root"}@${rootPkg.version ?? "0.0.0"}`,
  count: sorted.length,
  direct: sorted.filter((c) => c.properties?.length).length,
}));
