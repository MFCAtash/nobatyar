/** تنظیمات worker استرداد خودکار — fail-closed و کاملاً اعتبارسنجیشده. */
export const REFUND_WORKER_CONFIG = Symbol("REFUND_WORKER_CONFIG");

export interface RefundWorkerConfig {
  enabled: boolean;
  everyMs: number;
  batch: number;
  minAgeMin: number;
  maxTry: number;
}

const int = (v: string | undefined, d: number, name: string, min: number, max: number): number => {
  if (v === undefined || v === "") return d;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer in [${min}, ${max}]`);
  return n;
};

export function loadRefundWorkerConfig(env: NodeJS.ProcessEnv, flagEnabled: boolean): RefundWorkerConfig {
  return {
    enabled: flagEnabled && env.REFUND_WORKER_ENABLED !== "false",
    everyMs: int(env.REFUND_WORKER_EVERY_MS, 300_000, "REFUND_WORKER_EVERY_MS", 30_000, 3_600_000),
    batch: int(env.REFUND_WORKER_BATCH, 10, "REFUND_WORKER_BATCH", 1, 50),
    minAgeMin: int(env.REFUND_WORKER_MIN_AGE_MIN, 5, "REFUND_WORKER_MIN_AGE_MIN", 0, 1440),
    maxTry: int(env.REFUND_WORKER_MAX_TRY, 3, "REFUND_WORKER_MAX_TRY", 1, 10),
  };
}
