import { toOpenApiPath } from "./route-scan";
import { zodToParameters, zodToSchema, type JsonSchema } from "./zod-to-schema";

export type AuthKind = "public" | "user" | "admin" | "doctor" | "patient";

export interface RouteDoc {
  method: "get" | "post" | "patch" | "put" | "delete";
  /** مسیر به شکل Nest بدون پیشوند api/v1 (مثلاً /admin/refunds/:id/execute) */
  path: string;
  tag: string;
  summary: string;
  auth: AuthKind;
  /** هدر Idempotency-Key: required (۴۰۰ بدون آن) | optional */
  idempotency?: "required" | "optional";
  body?: unknown;
  query?: unknown;
  /** پاسخ موفق؛ بدون schema ⇒ فقط توضیح */
  ok?: { status?: number; description?: string; schema?: JsonSchema };
  /** کدهای خطای مهم (۴۰۹ و …) برای مصرف‌کننده */
  errors?: Record<number, string>;
}

const ERROR_SCHEMA: JsonSchema = { type: "object", properties: { error: { type: "string", description: "کد ماشینی خطا" }, message: { type: "string" } }, required: ["error"] };

export function buildOpenApi(routes: RouteDoc[], info: { title: string; version: string; description?: string }): JsonSchema {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of routes) {
    const path = toOpenApiPath(r.path);
    const parameters: unknown[] = [...(path.match(/\{(\w+)\}/g) ?? []).map((p) => ({ name: p.slice(1, -1), in: "path", required: true, schema: p.includes("id") ? { type: "string", format: "uuid" } : { type: "string" } })), ...zodToParameters(r.query, "query")];
    if (r.idempotency) parameters.push({ $ref: r.idempotency === "required" ? "#/components/parameters/IdempotencyKeyRequired" : "#/components/parameters/IdempotencyKeyOptional" });
    const status = String(r.ok?.status ?? (r.method === "post" ? 201 : 200));
    const responses: Record<string, unknown> = {
      [status]: { description: r.ok?.description ?? "موفق", ...(r.ok?.schema ? { content: { "application/json": { schema: r.ok.schema } } } : {}) },
    };
    if (r.auth !== "public") { responses["401"] = { $ref: "#/components/responses/Unauthorized" }; }
    if (r.auth === "admin" || r.auth === "doctor" || r.auth === "patient") responses["403"] = { $ref: "#/components/responses/Forbidden" };
    if (r.body) responses["400"] = { $ref: "#/components/responses/ValidationError" };
    if (r.idempotency) { responses["409"] = { description: "درخواست هم‌کلید در حال اجرا (Retry-After)", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } }; responses["422"] = { description: "این Idempotency-Key پیش‌تر با درخواست دیگری استفاده شده", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } }; }
    for (const [code, d] of Object.entries(r.errors ?? {})) responses[code] = { description: d, content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } };
    (paths[path] ??= {})[r.method] = {
      tags: [r.tag], summary: r.summary, operationId: `${r.method}${path.replace(/[{}]/g, "").split("/").filter(Boolean).map((s) => s[0].toUpperCase() + s.slice(1)).join("")}`,
      security: r.auth === "public" ? [] : [{ bearerAuth: [] }],
      ...(parameters.length ? { parameters } : {}),
      ...(r.body ? { requestBody: { required: true, content: { "application/json": { schema: zodToSchema(r.body) } } } } : {}),
      responses,
      ...(r.auth === "admin" ? { "x-roles": ["ADMIN"] } : r.auth === "doctor" ? { "x-roles": ["DOCTOR"] } : r.auth === "patient" ? { "x-roles": ["PATIENT"] } : {}),
    };
  }
  return {
    openapi: "3.1.0",
    info,
    servers: [{ url: "/api/v1" }],
    paths: Object.fromEntries(Object.entries(paths).sort(([a], [b]) => a.localeCompare(b))),
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "access token ی کوتاه‌عمر؛ تمدید با کوکی HttpOnly ی refresh. با خروج/تعلیق، همین حالا باطل می‌شود (sid)." } },
      parameters: {
        IdempotencyKeyRequired: { name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 16, maxLength: 128, pattern: "^[A-Za-z0-9._:-]+$" }, description: "کلید یکتا برای «یک قصد»؛ تلاش مجدد همان کلید ⇒ همان پاسخ (هدر Idempotent-Replayed)." },
        IdempotencyKeyOptional: { name: "Idempotency-Key", in: "header", required: false, schema: { type: "string", minLength: 16, maxLength: 128, pattern: "^[A-Za-z0-9._:-]+$" } },
      },
      responses: {
        Unauthorized: { description: "توکن نامعتبر/باطل‌شده", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
        Forbidden: { description: "نقش مجاز نیست", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
        ValidationError: { description: "بدنه نامعتبر (فیلد اضافه هم رد می‌شود)", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
      },
      schemas: { ApiError: ERROR_SCHEMA },
    },
  };
}
