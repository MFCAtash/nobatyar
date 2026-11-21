/**
 * تست با Zod ی «واقعی» (در CI اجرا می‌شود): مبدل باید برای schema های واقعی پروژه خروجی درست بدهد
 * و فایل openapi/openapi.json با سند فعلی هم‌خوان باشد.
 */
import "reflect-metadata";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { requestApprovalSchema } from "../admin/finance.schemas";
import { buildDocument } from "./build-document";
import { zodToSchema } from "./zod-to-schema";

describe("zodToSchema با Zod واقعی", () => {
  it("اشیاء، enum، اختیاری، strict و regex", () => {
    const s = zodToSchema(z.object({ id: z.string().uuid(), n: z.number().int().min(1).max(5), kind: z.enum(["A", "B"]), note: z.string().max(10).optional() }).strict()) as { required: string[]; additionalProperties: boolean; properties: Record<string, unknown> };
    expect(s.required).toEqual(["id", "n", "kind"]);
    expect(s.additionalProperties).toBe(false);
    expect(s.properties.id).toEqual({ type: "string", format: "uuid" });
    expect(s.properties.n).toEqual({ type: "integer", minimum: 1, maximum: 5 });
    expect(s.properties.kind).toEqual({ type: "string", enum: ["A", "B"] });
  });
  it("coerce/default/transform (query ها) خراب نمی‌شوند", () => {
    const s = zodToSchema(z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), attention: z.enum(["true", "false"]).default("false").transform((v) => v === "true") })) as { properties: Record<string, { default?: unknown }> };
    expect(s.properties.limit.default).toBe(50);
    expect(s.properties.attention.default).toBe("false");
  });
  it("schema ی واقعی Maker/Checker", () => {
    const s = zodToSchema(requestApprovalSchema) as { properties: Record<string, { enum?: string[] }>; required: string[] };
    expect(s.properties.action.enum).toEqual(["EXECUTE", "MARK_PROCESSED"]);
    expect(s.required).toEqual(["action"]);
  });
});

describe("openapi/openapi.json", () => {
  it("با سند فعلی هم‌خوان است (pnpm --filter @nobatyar/api openapi)", () => {
    const file = readFileSync(join(__dirname, "../../openapi/openapi.json"), "utf8");
    expect(file).toBe(`${JSON.stringify(buildDocument(), null, 2)}\n`);
  });
});
