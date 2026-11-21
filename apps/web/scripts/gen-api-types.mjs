#!/usr/bin/env node
/**
 * تولید client ی تایپ‌شده از apps/api/openapi/openapi.json (بدون وابستگی):
 *   node scripts/gen-api-types.mjs          ⇒ src/lib/api-types.generated.ts
 *   node scripts/gen-api-types.mjs --check  ⇒ اگر کهنه باشد با کد ۱ خارج می‌شود (CI)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const specFile = resolve(root, "../api/openapi/openapi.json");
const outFile = resolve(root, "src/lib/api-types.generated.ts");
const check = process.argv.includes("--check");
const spec = JSON.parse(readFileSync(specFile, "utf8"));

const q = (s) => JSON.stringify(s);
const isIdent = (k) => /^[A-Za-z_$][\w$]*$/.test(k);

/** JSON Schema ⇒ نوع TypeScript */
function ts(s, ind = "") {
  if (!s || Object.keys(s).length === 0) return "unknown";
  if (s.$ref) return s.$ref.split("/").pop();
  if ("const" in s) return q(s.const);
  if (s.enum) return s.enum.map(q).join(" | ");
  if (s.anyOf) return s.anyOf.map((x) => ts(x, ind)).join(" | ");
  switch (s.type) {
    case "string": return "string";
    case "integer": case "number": return "number";
    case "boolean": return "boolean";
    case "null": return "null";
    case "array": return `${wrap(ts(s.items, ind))}[]`;
    case "object": {
      const props = s.properties ?? {};
      const req = new Set(s.required ?? []);
      const lines = Object.entries(props).map(([k, v]) => `${ind}  ${isIdent(k) ? k : q(k)}${req.has(k) ? "" : "?"}: ${ts(v, ind + "  ")};`);
      if (s.additionalProperties && typeof s.additionalProperties === "object") lines.push(`${ind}  [key: string]: ${ts(s.additionalProperties, ind + "  ")};`);
      return lines.length ? `{\n${lines.join("\n")}\n${ind}}` : "Record<string, unknown>";
    }
    default: return "unknown";
  }
}
const wrap = (t) => (/[|{]/.test(t) ? `(${t})` : t);

const ops = [];
for (const [path, item] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(item)) {
    const M = method.toUpperCase();
    const params = (op.parameters ?? []).filter((p) => p.in === "path");
    const queryParams = (op.parameters ?? []).filter((p) => p.in === "query");
    const idem = (op.parameters ?? []).find((p) => p.$ref?.includes("IdempotencyKey"));
    const okCode = Object.keys(op.responses).find((c) => c.startsWith("2"));
    const okSchema = op.responses[okCode]?.content?.["application/json"]?.schema;
    ops.push({
      key: `${M} ${path}`, method: M, path, summary: op.summary, operationId: op.operationId,
      public: (op.security ?? [{}]).length === 0,
      idempotency: idem ? (idem.$ref.endsWith("Required") ? "required" : "optional") : null,
      params: params.length ? `{ ${params.map((p) => `${p.name}: string`).join("; ")} }` : "undefined",
      query: queryParams.length ? `{ ${queryParams.map((p) => `${isIdent(p.name) ? p.name : q(p.name)}${p.required ? "" : "?"}: ${ts(p.schema)}`).join("; ")} }` : "undefined",
      body: op.requestBody ? ts(op.requestBody.content["application/json"].schema, "    ") : "undefined",
      response: okCode === "204" ? "void" : okSchema ? ts(okSchema, "    ") : "unknown",
    });
  }
}

const out = `/* eslint-disable */
/**
 * ⚠️ خودکار از apps/api/openapi/openapi.json ساخته شده؛ دستی ویرایش نکنید.
 *   pnpm --filter @nobatyar/api openapi && pnpm --filter @nobatyar/web gen:api
 */
export interface ApiErrorBody { error: string; message?: string }

export interface Operations {
${ops.map((o) => `  ${q(o.key)}: {\n    params: ${o.params};\n    query: ${o.query};\n    body: ${o.body};\n    response: ${o.response};\n  };`).join("\n")}
}

/** فراداده‌ی هر عملیات (مسیر، متد، عمومی‌بودن، الزام Idempotency-Key). */
export const OPERATIONS = {
${ops.map((o) => `  ${q(o.key)}: { method: ${q(o.method)}, path: ${q(o.path)}, public: ${o.public}, idempotency: ${o.idempotency ? q(o.idempotency) : "null"}, summary: ${q(o.summary ?? "")} },`).join("\n")}
} as const;

export type OperationKey = keyof Operations;
`;

if (check) {
  if (!existsSync(outFile) || readFileSync(outFile, "utf8") !== out) { console.error("✗ src/lib/api-types.generated.ts کهنه است ⇒ pnpm --filter @nobatyar/web gen:api"); process.exit(1); }
  console.log("api types: به‌روز است");
} else {
  writeFileSync(outFile, out);
  console.log(`✓ ${ops.length} عملیات ⇒ src/lib/api-types.generated.ts`);
}
