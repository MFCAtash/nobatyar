import type { Api, RequestOptions } from "./api";
import { OPERATIONS, type OperationKey, type Operations } from "./api-types.generated";
import { idempotencyHeaders } from "./idempotency";

/**
 * client ی تایپ‌شده از روی OpenAPI ی API (api-types.generated.ts):
 *   await typed.call("POST /admin/refunds/{id}/request-approval", { params: { id }, body: { action: "EXECUTE" }, idempotencyKey })
 * مسیر، شکل بدنه/query و پاسخ در زمان کامپایل بررسی می‌شود؛ endpoint ی مالی بدون idempotencyKey کامپایل نمی‌شود.
 */
type Has<T> = [T] extends [undefined] ? false : true;
type Op<K extends OperationKey> = Operations[K];

export type CallArgs<K extends OperationKey> =
  (Has<Op<K>["params"]> extends true ? { params: NonNullable<Op<K>["params"]> } : { params?: undefined }) &
  (Has<Op<K>["query"]> extends true ? { query?: NonNullable<Op<K>["query"]> } : { query?: undefined }) &
  (Has<Op<K>["body"]> extends true ? { body: NonNullable<Op<K>["body"]> } : { body?: undefined }) &
  ((typeof OPERATIONS)[K]["idempotency"] extends "required" ? { idempotencyKey: string } : { idempotencyKey?: string });

export interface BuiltRequest { path: string; init: RequestOptions }

/** منطق خالص: قالب مسیر + پارامترها ⇒ درخواست نهایی (قابل‌تست بدون شبکه). */
export function buildRequest<K extends OperationKey>(op: K, args: CallArgs<K>): BuiltRequest {
  const meta = OPERATIONS[op];
  const a = args as { params?: Record<string, string>; query?: Record<string, unknown>; body?: unknown; idempotencyKey?: string };
  let path: string = meta.path.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = a.params?.[name];
    if (v === undefined) throw new Error(`پارامتر مسیر «${name}» برای ${op} لازم است`);
    return encodeURIComponent(v);
  });
  if (a.query) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(a.query)) if (v !== undefined && v !== null) sp.set(k, String(v));
    const qs = sp.toString();
    if (qs) path += `?${qs}`;
  }
  if (meta.idempotency === "required" && !a.idempotencyKey) throw new Error(`${op} نیازمند idempotencyKey است`);
  return {
    path,
    init: {
      method: meta.method,
      ...(a.body !== undefined ? { body: a.body } : meta.method === "GET" || meta.method === "DELETE" ? {} : { body: {} }),
      ...(meta.public ? { auth: false } : {}),
      ...(a.idempotencyKey ? { headers: idempotencyHeaders(a.idempotencyKey) } : {}),
    },
  };
}

export function createTypedApi(api: Pick<Api, "request">) {
  return {
    call<K extends OperationKey>(op: K, args: CallArgs<K>): Promise<Op<K>["response"]> {
      const { path, init } = buildRequest(op, args);
      return api.request<Op<K>["response"]>(path, init);
    },
  };
}
