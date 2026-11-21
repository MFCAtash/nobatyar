/**
 * تست یکپارچه‌ی Redis pub/sub اعلان‌ها روی Redis «واقعی»: دو «نمونه‌ی API» (هر کدام publisher و subscriber ی جدا).
 * نیازمند TEST_REDIS_URL؛ بدون آن skip می‌شود.
 * ⚠️ در محیط ساخت ioredis نصب نبود؛ همین سناریو با یک کلاینت RESP حداقلی روی redis-server واقعی سبز شد،
 *    ولی این فایل (با ioredis) اجرا نشده است — پیش از اتکا یک‌بار اجرا شود.
 */
import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NotificationHub, userChannel } from "../src/notifications/notification-hub";
import type { NotificationEvent } from "../src/notifications/sse-format";
import { RedisPublisher, RedisSubscriber } from "../src/redis/pubsub";
import type { RedisPubLike, RedisSubLike } from "../src/redis/pubsub";

const URL_ = process.env.TEST_REDIS_URL;
const d = URL_ ? describe : describe.skip;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (c: () => boolean, ms = 3000) => { const t = Date.now(); while (!c()) { if (Date.now() - t > ms) throw new Error("timeout"); await wait(10); } };

d("NotificationHub روی Redis واقعی", () => {
  const clients: Redis[] = [];
  const mkInstance = () => {
    const pub = new Redis(URL_!, { maxRetriesPerRequest: 2 });
    const sub = new Redis(URL_!, { maxRetriesPerRequest: 2 });
    clients.push(pub, sub);
    return { hub: new NotificationHub(new RedisPublisher(pub as unknown as RedisPubLike), new RedisSubscriber(sub as unknown as RedisSubLike)), pub };
  };
  const ev = (): NotificationEvent => ({ id: randomUUID(), kind: "SYSTEM", titleFa: "t", bodyFa: "b", payload: {}, readAt: null, createdAt: new Date().toISOString() });
  let A: ReturnType<typeof mkInstance>, B: ReturnType<typeof mkInstance>;
  const user = randomUUID();

  beforeAll(() => { A = mkInstance(); B = mkInstance(); });
  afterAll(async () => { await Promise.all(clients.map((c) => c.quit().catch(() => undefined))); });

  it("اعلان منتشرشده در A به شنونده‌ی B می‌رسد و کاربر دیگر چیزی نمی‌گیرد", async () => {
    const mine: string[] = [], other: string[] = [];
    const off = await B.hub.subscribe(user, { onNotification: (n) => void mine.push(n.id), onResync: () => undefined });
    const off2 = await B.hub.subscribe(randomUUID(), { onNotification: (n) => void other.push(n.id), onResync: () => undefined });
    const n = ev();
    await A.hub.publish(user, n);
    await until(() => mine.length === 1);
    expect(mine).toEqual([n.id]);
    expect(other).toEqual([]);
    await off(); await off2();
  });

  it("کانال فقط تا وقتی شنونده‌ی محلی هست subscribe می‌ماند", async () => {
    const probe = new Redis(URL_!); clients.push(probe);
    const off = await B.hub.subscribe(user, { onNotification: () => undefined, onResync: () => undefined });
    expect(await probe.pubsub("CHANNELS", userChannel(user))).toEqual([userChannel(user)]);
    await off();
    await wait(50);
    expect(await probe.pubsub("CHANNELS", userChannel(user))).toEqual([]);
  });
});
