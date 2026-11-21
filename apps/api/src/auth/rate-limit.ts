import type { KeyValueStore } from "../redis/kv-store";

export interface RateResult {
  allowed: boolean;
  count: number;
  retryAfterSec: number;
}

/** محدودکننده‌ی پنجره‌ی ثابت روی KV. هر فراخوانی یک «ضربه» حساب می‌شود. */
export class RateLimiter {
  constructor(private readonly kv: KeyValueStore) {}

  async hit(key: string, limit: number, windowSec: number): Promise<RateResult> {
    const count = await this.kv.incr(`rl:${key}`, windowSec);
    if (count <= limit) return { allowed: true, count, retryAfterSec: 0 };
    return { allowed: false, count, retryAfterSec: await this.kv.ttl(`rl:${key}`) };
  }
}
