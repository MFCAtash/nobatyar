import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOpenApi, type RouteDoc } from "./build";
import { ROUTES } from "./registry";
import { routeKey, scanControllers, toOpenApiPath } from "./route-scan";
import { zodToParameters, zodToSchema } from "./zod-to-schema";

// ساختار _def ی Zod 3 به‌صورت دستی (این فایل بدون Zod ی واقعی هم اجرا می‌شود؛ تست با Zod ی واقعی: openapi.zod.test.ts)
const def = (typeName: string, d: Record<string, unknown> = {}) => ({ _def: { typeName, ...d } });
const str = (checks: unknown[] = []) => def("ZodString", { checks });
const num = (checks: unknown[] = []) => def("ZodNumber", { checks });
const opt = (inner: unknown) => def("ZodOptional", { innerType: inner });
const obj = (shape: Record<string, unknown>, unknownKeys = "strip") => def("ZodObject", { shape: () => shape, unknownKeys });

describe("zodToSchema", () => {
  it("strings: min/max/uuid/regex", () => {
    expect(zodToSchema(str([{ kind: "min", value: 3 }, { kind: "max", value: 10 }]))).toEqual({ type: "string", minLength: 3, maxLength: 10 });
    expect(zodToSchema(str([{ kind: "uuid" }]))).toEqual({ type: "string", format: "uuid" });
    expect(zodToSchema(str([{ kind: "regex", regex: /^\d+$/ }]))).toEqual({ type: "string", pattern: "^\\d+$" });
  });
  it("numbers: int + bounds", () => {
    expect(zodToSchema(num([{ kind: "int" }, { kind: "min", value: 1, inclusive: true }, { kind: "max", value: 100, inclusive: true }]))).toEqual({ type: "integer", minimum: 1, maximum: 100 });
  });
  it("object: required vs optional, strict ⇒ additionalProperties:false", () => {
    const s = zodToSchema(obj({ a: str(), b: opt(num()) }, "strict"));
    expect(s).toEqual({ type: "object", properties: { a: { type: "string" }, b: { type: "number" } }, required: ["a"], additionalProperties: false });
  });
  it("enum, array, nullable, default, effects", () => {
    expect(zodToSchema(def("ZodEnum", { values: ["A", "B"] }))).toEqual({ type: "string", enum: ["A", "B"] });
    expect(zodToSchema(def("ZodArray", { type: str(), minLength: null, maxLength: { value: 3 } }))).toEqual({ type: "array", items: { type: "string" }, maxItems: 3 });
    expect(zodToSchema(def("ZodNullable", { innerType: str() }))).toEqual({ anyOf: [{ type: "string" }, { type: "null" }] });
    const withDefault = obj({ n: def("ZodDefault", { innerType: num(), defaultValue: () => 50 }) });
    expect(zodToSchema(withDefault)).toEqual({ type: "object", properties: { n: { type: "number", default: 50 } } });
    expect(zodToSchema(def("ZodEffects", { schema: str() }))).toEqual({ type: "string" });
  });
  it("unknown types degrade to {} (never a wrong schema); non-zod ⇒ {}", () => {
    expect(zodToSchema(def("ZodSomethingNew"))).toEqual({});
    expect(zodToSchema(undefined)).toEqual({});
  });
  it("query objects become parameters", () => {
    expect(zodToParameters(obj({ status: opt(def("ZodEnum", { values: ["A"] })), limit: num() }), "query")).toEqual([
      { name: "status", in: "query", required: false, schema: { type: "string", enum: ["A"] } },
      { name: "limit", in: "query", required: true, schema: { type: "number" } },
    ]);
  });
});

describe("buildOpenApi", () => {
  const routes: RouteDoc[] = [
    { method: "post", path: "/admin/refunds/:id/execute", tag: "R", summary: "x", auth: "admin", idempotency: "required", body: obj({ note: str() }, "strict"), ok: { status: 200 } },
    { method: "get", path: "/me", tag: "M", summary: "me", auth: "user" },
    { method: "post", path: "/auth/otp/request", tag: "A", summary: "otp", auth: "public", body: obj({ phone: str() }), ok: { status: 202 } },
  ];
  const doc = buildOpenApi(routes, { title: "T", version: "1" }) as { paths: Record<string, Record<string, Record<string, unknown>>>; components: { parameters: Record<string, unknown> } };

  it("converts :id to {id} and declares a uuid path parameter", () => {
    const op = doc.paths["/admin/refunds/{id}/execute"].post;
    expect(op.parameters).toContainEqual({ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } });
  });
  it("money endpoints reference the required Idempotency-Key and document 409/422", () => {
    const op = doc.paths["/admin/refunds/{id}/execute"].post as { parameters: unknown[]; responses: Record<string, unknown> };
    expect(op.parameters).toContainEqual({ $ref: "#/components/parameters/IdempotencyKeyRequired" });
    expect(Object.keys(op.responses)).toEqual(expect.arrayContaining(["200", "401", "403", "400", "409", "422"]));
    expect((doc.components.parameters.IdempotencyKeyRequired as { required: boolean }).required).toBe(true);
  });
  it("public routes have no security and no 401; others use bearerAuth", () => {
    expect(doc.paths["/auth/otp/request"].post.security).toEqual([]);
    expect(Object.keys(doc.paths["/auth/otp/request"].post.responses as object)).not.toContain("401");
    expect(doc.paths["/me"].get.security).toEqual([{ bearerAuth: [] }]);
  });
  it("operationIds are unique across the real registry", () => {
    const real = buildOpenApi(ROUTES, { title: "T", version: "1" }) as { paths: Record<string, Record<string, { operationId: string }>> };
    const ids = Object.values(real.paths).flatMap((p) => Object.values(p).map((o) => o.operationId));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("registry ↔ controllers (جلوگیری از مستند کهنه و مسیر بی‌مستند)", () => {
  const src = resolve(__dirname, "..");
  const real = scanControllers(src).filter((r) => !r.path.startsWith("/__e2e") && !["/metrics", "/health", "/health/ready", "/openapi.json"].includes(r.path));
  const realKeys = new Set(real.map(routeKey));
  const documented = ROUTES.map((r) => `${r.method.toUpperCase()} ${toOpenApiPath(r.path)}`);
  const allow = (JSON.parse(readFileSync(join(__dirname, "../../openapi/undocumented.json"), "utf8")) as { routes: string[] }).routes;

  it("scans a realistic number of routes", () => expect(real.length).toBeGreaterThan(80));

  it("every documented route exists in a controller (no stale docs)", () => {
    expect(documented.filter((k) => !realKeys.has(k))).toEqual([]);
  });
  it("no duplicate documentation", () => expect(new Set(documented).size).toBe(documented.length));

  it("every undocumented route is in the allow-list; a new endpoint must be documented", () => {
    const undocumented = [...realKeys].filter((k) => !documented.includes(k));
    expect(undocumented.filter((k) => !allow.includes(k))).toEqual([]);
  });
  it("the allow-list only shrinks: documented routes must be removed from it", () => {
    expect(allow.filter((k) => documented.includes(k) || !realKeys.has(k))).toEqual([]);
  });
  it("coverage report", () => {
    const pct = Math.round((documented.length / realKeys.size) * 100);
    console.log(`OpenAPI coverage: ${documented.length}/${realKeys.size} (${pct}%)`);
    expect(pct).toBeGreaterThanOrEqual(40);
  });
});
