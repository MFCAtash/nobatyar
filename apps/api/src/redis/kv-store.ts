/** انتزاع کوچک روی Redis — برای تست بدون Redis هم نسخه‌ی حافظه‌ای دارد. */
export const KV_STORE = Symbol("KV_STORE");

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
  /** شمارنده‌ی پنجره‌ی ثابت: در اولین افزایش TTL می‌گیرد. مقدار جدید را برمی‌گرداند. */
  incr(key: string, ttlSec: number): Promise<number>;
  /** تعداد کلید حذف‌شده (۰ یا ۱) — برای مصرف یک‌بارمصرف اتمیک. */
  del(key: string): Promise<number>;
  /** ثانیه‌های باقی‌مانده؛ ۰ اگر کلید نیست. */
  ttl(key: string): Promise<number>;
}

export class InMemoryKv implements KeyValueStore {
  private m = new Map<string, { v: string; exp: number }>();
  constructor(private now: () => number = Date.now) {}

  private live(key: string) {
    const e = this.m.get(key);
    if (!e) return undefined;
    if (e.exp <= this.now()) {
      this.m.delete(key);
      return undefined;
    }
    return e;
  }
  async get(key: string) {
    return this.live(key)?.v ?? null;
  }
  async set(key: string, value: string, ttlSec: number) {
    this.m.set(key, { v: value, exp: this.now() + ttlSec * 1000 });
  }
  async incr(key: string, ttlSec: number) {
    const e = this.live(key);
    if (!e) {
      this.m.set(key, { v: "1", exp: this.now() + ttlSec * 1000 });
      return 1;
    }
    e.v = String(Number(e.v) + 1);
    return Number(e.v);
  }
  async del(key: string) {
    return this.live(key) ? (this.m.delete(key), 1) : 0;
  }
  async ttl(key: string) {
    const e = this.live(key);
    return e ? Math.max(1, Math.ceil((e.exp - this.now()) / 1000)) : 0;
  }
}

/** پیاده‌سازی روی ioredis (client به‌صورت ساختاری تایپ شده تا وابستگی در تست لازم نباشد). */
export interface RedisLike {
  get(k: string): Promise<string | null>;
  set(...args: (string | number)[]): Promise<unknown>;
  incr(k: string): Promise<number>;
  del(k: string): Promise<number>;
  ttl(k: string): Promise<number>;
}

export class RedisKv implements KeyValueStore {
  constructor(private r: RedisLike) {}
  get(key: string) {
    return this.r.get(key);
  }
  async set(key: string, value: string, ttlSec: number) {
    await this.r.set(key, value, "EX", ttlSec);
  }
  async incr(key: string, ttlSec: number) {
    // NX: TTL فقط یک‌بار؛ اگر فرایند بین دو دستور بمیرد کلیدِ بدون TTL نمی‌ماند.
    await this.r.set(key, "0", "EX", ttlSec, "NX");
    return this.r.incr(key);
  }
  del(key: string) {
    return this.r.del(key);
  }
  async ttl(key: string) {
    const t = await this.r.ttl(key);
    return t > 0 ? t : 0;
  }
}
