import { decide, type StoredKey } from "./idempotency-policy";

export type BeginResult =
  | { kind: "acquired" }
  | { kind: "replay"; status: number; body: unknown }
  | { kind: "in_progress"; retryAfterSec: number }
  | { kind: "mismatch" };

export interface IdempotencyStore {
  /** اتمیک: یا قفل می‌گیرد، یا نتیجه‌ی ذخیره‌شده را می‌دهد، یا هم‌زمانی/ناهمخوانی را اعلام می‌کند. */
  begin(scope: string, key: string, fp: string, lockMs: number, ttlMs: number, now: Date): Promise<BeginResult>;
  complete(scope: string, key: string, status: number, body: unknown, now: Date): Promise<void>;
  /** خطا/پاسخ ناموفق: قفل آزاد شود تا کلاینت با همان کلید دوباره امتحان کند. */
  release(scope: string, key: string): Promise<void>;
  purgeExpired(now: Date): Promise<number>;
}

/** نسخه‌ی حافظه‌ای (تست/توسعه). رفتار با PrismaIdempotencyStore یکسان است. */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private rows = new Map<string, StoredKey>();
  private id = (s: string, k: string) => `${s}\u0000${k}`;

  async begin(scope: string, key: string, fp: string, lockMs: number, ttlMs: number, now: Date): Promise<BeginResult> {
    const id = this.id(scope, key);
    const ex = this.rows.get(id) ?? null;
    const d = decide(ex, fp, now);
    switch (d.kind) {
      case "execute":
      case "takeover":
        this.rows.set(id, { fingerprint: fp, state: "IN_PROGRESS", lockedUntil: new Date(now.getTime() + lockMs), expiresAt: new Date(now.getTime() + ttlMs), statusCode: null, response: null });
        return { kind: "acquired" };
      default:
        return d;
    }
  }
  async complete(scope: string, key: string, status: number, body: unknown, _now: Date): Promise<void> {
    const r = this.rows.get(this.id(scope, key));
    if (r) { r.state = "COMPLETED"; r.statusCode = status; r.response = JSON.parse(JSON.stringify(body ?? null)); }
  }
  async release(scope: string, key: string): Promise<void> { this.rows.delete(this.id(scope, key)); }
  async purgeExpired(now: Date): Promise<number> {
    let n = 0;
    for (const [k, v] of this.rows) if (v.expiresAt.getTime() <= now.getTime()) { this.rows.delete(k); n++; }
    return n;
  }
  get size(): number { return this.rows.size; }
}
