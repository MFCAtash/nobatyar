/**
 * تبدیل schema ی Zod (نسخه ۳) به JSON Schema ی سازگار با OpenAPI 3.1 — بدون وابستگی اضافه.
 * فقط از ساختار داخلی `_def` می‌خواند؛ هر نوع ناشناخته ⇒ `{}` (هر مقدار) تا سند هرگز «غلط» نشود.
 * .strict() ⇒ additionalProperties:false (همان چیزی که ZodPipe اجبار می‌کند).
 */
export type JsonSchema = { [k: string]: unknown };

interface Def { typeName?: string; [k: string]: unknown }
export interface ZodLike { _def: Def }

const isZod = (v: unknown): v is ZodLike => typeof v === "object" && v !== null && "_def" in v && typeof (v as ZodLike)._def === "object";
const check = (def: Def): { kind: string; value?: unknown; inclusive?: boolean; regex?: RegExp }[] => (Array.isArray(def.checks) ? (def.checks as never) : []);

interface Converted { schema: JsonSchema; optional: boolean }

function convert(z: ZodLike): Converted {
  const def = z._def;
  switch (def.typeName) {
    case "ZodOptional": return { schema: convert(def.innerType as ZodLike).schema, optional: true };
    case "ZodDefault": { const c = convert(def.innerType as ZodLike); const dv = typeof def.defaultValue === "function" ? (def.defaultValue as () => unknown)() : undefined; return { schema: dv === undefined ? c.schema : { ...c.schema, default: dv }, optional: true }; }
    case "ZodNullable": { const inner = convert(def.innerType as ZodLike); return { schema: { anyOf: [inner.schema, { type: "null" }] }, optional: inner.optional }; }
    case "ZodEffects": return convert(def.schema as ZodLike);
    case "ZodBranded": case "ZodReadonly": case "ZodCatch": return convert((def.type ?? def.innerType) as ZodLike);
    case "ZodString": {
      const s: JsonSchema = { type: "string" };
      for (const c of check(def)) {
        if (c.kind === "min") s.minLength = c.value;
        else if (c.kind === "max") s.maxLength = c.value;
        else if (c.kind === "length") { s.minLength = c.value; s.maxLength = c.value; }
        else if (c.kind === "uuid") s.format = "uuid";
        else if (c.kind === "email") s.format = "email";
        else if (c.kind === "url") s.format = "uri";
        else if (c.kind === "datetime") s.format = "date-time";
        else if (c.kind === "regex" && c.regex) s.pattern = c.regex.source;
      }
      return { schema: s, optional: false };
    }
    case "ZodNumber": {
      const s: JsonSchema = { type: "number" };
      for (const c of check(def)) {
        if (c.kind === "int") s.type = "integer";
        else if (c.kind === "min") s[c.inclusive === false ? "exclusiveMinimum" : "minimum"] = c.value;
        else if (c.kind === "max") s[c.inclusive === false ? "exclusiveMaximum" : "maximum"] = c.value;
      }
      return { schema: s, optional: false };
    }
    case "ZodBigInt": return { schema: { type: "string", pattern: "^\\d+$", description: "عدد صحیح بزرگ به‌صورت رشته" }, optional: false };
    case "ZodBoolean": return { schema: { type: "boolean" }, optional: false };
    case "ZodDate": return { schema: { type: "string", format: "date-time" }, optional: false };
    case "ZodLiteral": return { schema: { const: def.value }, optional: false };
    case "ZodEnum": return { schema: { type: "string", enum: def.values }, optional: false };
    case "ZodNativeEnum": return { schema: { enum: Object.values(def.values as Record<string, unknown>) }, optional: false };
    case "ZodArray": {
      const s: JsonSchema = { type: "array", items: convert(def.type as ZodLike).schema };
      const min = (def.minLength as { value?: number } | null)?.value, max = (def.maxLength as { value?: number } | null)?.value;
      if (min !== undefined) s.minItems = min;
      if (max !== undefined) s.maxItems = max;
      return { schema: s, optional: false };
    }
    case "ZodRecord": return { schema: { type: "object", additionalProperties: convert(def.valueType as ZodLike).schema }, optional: false };
    case "ZodUnion": case "ZodDiscriminatedUnion": {
      const opts = def.options instanceof Map ? [...(def.options as Map<unknown, ZodLike>).values()] : (def.options as ZodLike[]);
      return { schema: { anyOf: opts.map((o) => convert(o).schema) }, optional: false };
    }
    case "ZodObject": {
      const shape = typeof def.shape === "function" ? (def.shape as () => Record<string, ZodLike>)() : (def.shape as Record<string, ZodLike>);
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [k, v] of Object.entries(shape)) {
        const c = convert(v);
        properties[k] = c.schema;
        if (!c.optional) required.push(k);
      }
      const s: JsonSchema = { type: "object", properties };
      if (required.length) s.required = required;
      if (def.unknownKeys === "strict") s.additionalProperties = false;
      return { schema: s, optional: false };
    }
    default: return { schema: {}, optional: false };
  }
}

export function zodToSchema(z: unknown): JsonSchema {
  return isZod(z) ? convert(z).schema : {};
}

/** schema ی query/path: هر property یک پارامتر OpenAPI می‌شود. */
export function zodToParameters(z: unknown, where: "query" | "path"): { name: string; in: "query" | "path"; required: boolean; schema: JsonSchema }[] {
  if (!isZod(z) || z._def.typeName !== "ZodObject") return [];
  const shape = (z._def.shape as () => Record<string, ZodLike>)();
  return Object.entries(shape).map(([name, v]) => { const c = convert(v); return { name, in: where, required: where === "path" ? true : !c.optional, schema: c.schema }; });
}
