/**
 * تست یکپارچه‌ی RedisKv روی Redis واقعی (نه نسخه‌ی حافظه‌ای).
 * نیازمند TEST_REDIS_URL؛ بدون آن skip می‌شود.
 */
import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RedisKv } from "../src/redis/kv-store";

const URL_ = process.env.TEST_REDIS_URL;
const d = URL_ ? describe : describe.skip;

d("RedisKv (Redis واقعی)", () => {
  let client: Redis;
  let kv: RedisKv;
  const p = `it:${randomUUID()}:`;

  beforeAll(() => {
    client = new Redis(URL_!, { maxRetriesPerRequest: 2 });
    kv = new RedisKv(client as unknown as ConstructorParameters<typeof RedisKv>[0]);
  });
  afterAll(async () => {
    const keys = await client.keys(`${p}*`);
    if (keys.length) await client.del(...keys);
    await client.quit();
  });

  it("set/get با TTL", async () => {
    await kv.set(`${p}a`, "v", 30);
    expect(await kv.get(`${p}a`)).toBe("v");
    const ttl = await kv.ttl(`${p}a`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(30);
  });

  it("کلید ناموجود: get=null و ttl=0", async () => {
    expect(await kv.get(`${p}none`)).toBeNull();
    expect(await kv.ttl(`${p}none`)).toBe(0);
  });

  it("incr شمارنده‌ی پنجره‌ی ثابت: TTL فقط یک‌بار تنظیم می‌شود", async () => {
    expect(await kv.incr(`${p}c`, 60)).toBe(1);
    expect(await kv.incr(`${p}c`, 60)).toBe(2);
    expect(await kv.incr(`${p}c`, 60)).toBe(3);
    expect(await kv.ttl(`${p}c`)).toBeGreaterThan(0);
  });

  it("incr هم‌زمان: بدون گم‌شدن شمارش", async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => kv.incr(`${p}par`, 60)));
    expect(new Set(results).size).toBe(25);
    expect(Math.max(...results)).toBe(25);
  });

  it("del یک‌بارمصرف اتمیک: از ۱۰ تلاش هم‌زمان فقط یکی موفق", async () => {
    await kv.set(`${p}once`, "x", 30);
    const r = await Promise.all(Array.from({ length: 10 }, () => kv.del(`${p}once`)));
    expect(r.filter((n) => n === 1)).toHaveLength(1);
  });

  it("انقضا واقعاً اعمال می‌شود", async () => {
    await kv.set(`${p}exp`, "x", 1);
    await new Promise((r) => setTimeout(r, 1300));
    expect(await kv.get(`${p}exp`)).toBeNull();
  });
});
