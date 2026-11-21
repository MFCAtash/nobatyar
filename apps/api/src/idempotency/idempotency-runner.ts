import { fingerprint, LOCK_MS, COMPLETED_TTL_MS, shouldStore } from "./idempotency-policy";
import type { IdempotencyStore } from "./idempotency-store";

export class IdempotencyConflict extends Error {
  constructor(readonly code: "idempotency_in_progress" | "idempotency_key_reuse", readonly retryAfterSec?: number) { super(code); }
}

export interface RunInput {
  userId: string;
  method: string;
  /** مسیر الگو (/admin/refunds/:id/execute) برای scope */
  routeTemplate: string;
  /** URL واقعی (با شناسه و query) برای اثرانگشت */
  url: string;
  body: unknown;
  key: string;
  /** کد وضعیت موفقیت‌ی که Nest برای این handler می‌فرستد (۲۰۰/۲۰۱) */
  successStatus: number;
}

export interface RunResult<T> { replayed: boolean; body: T }

/**
 * هسته‌ی بدون وابستگی به Nest/rxjs: handler فقط وقتی اجرا می‌شود که این درخواست «قفل» را گرفته باشد.
 * (Interceptor فقط Observable ⇄ Promise را وصل می‌کند.)
 */
export async function runIdempotent<T>(store: IdempotencyStore, input: RunInput, handler: () => Promise<T>, now: () => Date = () => new Date()): Promise<RunResult<T>> {
  const scope = `${input.userId}:${input.method.toUpperCase()} ${input.routeTemplate}`;
  const fp = fingerprint(input.method, input.url, input.body);
  const r = await store.begin(scope, input.key, fp, LOCK_MS, COMPLETED_TTL_MS, now());
  if (r.kind === "replay") return { replayed: true, body: r.body as T };
  if (r.kind === "in_progress") throw new IdempotencyConflict("idempotency_in_progress", r.retryAfterSec);
  if (r.kind === "mismatch") throw new IdempotencyConflict("idempotency_key_reuse");

  let body: T;
  try {
    body = await handler();
  } catch (e) {
    await store.release(scope, input.key).catch(() => undefined); // خطا: کلاینت می‌تواند با همان کلید دوباره امتحان کند
    throw e;
  }
  if (shouldStore(input.successStatus, body)) await store.complete(scope, input.key, input.successStatus, body, now());
  else await store.release(scope, input.key).catch(() => undefined);
  return { replayed: false, body };
}
