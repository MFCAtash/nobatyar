import { describe, expect, it } from "vitest";
import { InMemoryPubSub } from "../redis/pubsub";
import { NotificationHub, userChannel } from "./notification-hub";
import type { HubListener } from "./notification-hub";
import type { NotificationEvent } from "./sse-format";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const ev = (id: string): NotificationEvent => ({
  id, kind: "SYSTEM", titleFa: "t", bodyFa: "b", payload: {}, readAt: null, createdAt: "2026-01-01T00:00:00.000Z",
});

function listener() {
  const got: string[] = [];
  let resyncs = 0;
  const l: HubListener = { onNotification: (n) => void got.push(n.id), onResync: () => void resyncs++ };
  return { l, got, resyncs: () => resyncs };
}

/** یک «نمونه‌ی API»: hub با publisher و subscriber ی «جدا» روی همان Redis. */
function instance(broker: InMemoryPubSub) {
  const pub = broker.publisher();
  const sub = broker.subscriber();
  const warns: string[] = [];
  const hub = new NotificationHub(pub, sub, { warn: (m) => void warns.push(m), error: () => undefined });
  return { hub, pub, sub, warns };
}

describe("NotificationHub", () => {
  it("اعلان منتشرشده در نمونه‌ی A به شنونده‌ی نمونه‌ی B می‌رسد (چند-instance)", async () => {
    const broker = new InMemoryPubSub();
    const A = instance(broker), B = instance(broker);
    const x = listener();
    await B.hub.subscribe("u1", x.l);
    await A.hub.publish("u1", ev("n1"));
    await tick();
    expect(x.got).toEqual(["n1"]);
  });

  it("کانال به‌ازای هر کاربر: کاربر دیگر چیزی نمی‌گیرد", async () => {
    const broker = new InMemoryPubSub();
    const A = instance(broker);
    const u1 = listener(), u2 = listener();
    await A.hub.subscribe("u1", u1.l);
    await A.hub.subscribe("u2", u2.l);
    await A.hub.publish("u1", ev("n1"));
    await tick();
    expect(u1.got).toEqual(["n1"]);
    expect(u2.got).toEqual([]);
    expect(A.pub.published[0].channel).toBe(userChannel("u1"));
  });

  it("publisher و subscriber دو شیء/اتصال جدا هستند", () => {
    const broker = new InMemoryPubSub();
    const A = instance(broker);
    expect((A.pub as unknown) === (A.sub as unknown)).toBe(false);
  });

  it("چند شنونده‌ی یک کاربر (چند تب): فقط یک SUBSCRIBE؛ UNSUBSCRIBE با رفتن آخری", async () => {
    const broker = new InMemoryPubSub();
    const A = instance(broker);
    const a = listener(), b = listener();
    const offA = await A.hub.subscribe("u1", a.l);
    const offB = await A.hub.subscribe("u1", b.l);
    expect(A.sub.subscribeCalls).toEqual([userChannel("u1")]);
    expect(A.hub.localCount("u1")).toBe(2);

    await offA();
    expect(A.sub.unsubscribeCalls).toEqual([]);
    await A.hub.publish("u1", ev("n1"));
    await tick();
    expect(a.got).toEqual([]);
    expect(b.got).toEqual(["n1"]);

    await offB();
    expect(A.sub.unsubscribeCalls).toEqual([userChannel("u1")]);
    expect(A.hub.activeChannels).toBe(0);
  });

  it("subscribe/unsubscribe هم‌زمانِ یک کانال سریالی است: وضعیت نهایی «subscribe» می‌ماند", async () => {
    const broker = new InMemoryPubSub();
    const A = instance(broker);
    const a = listener(), b = listener();
    const offA = await A.hub.subscribe("u1", a.l);
    // هم‌زمان: آخرین شنونده می‌رود و شنونده‌ی تازه می‌آید
    const [, offB] = await Promise.all([offA(), A.hub.subscribe("u1", b.l)]);
    expect(A.sub.channels.has(userChannel("u1"))).toBe(true);
    await A.hub.publish("u1", ev("n1"));
    await tick();
    expect(b.got).toEqual(["n1"]);
    await offB();
    expect(A.sub.channels.has(userChannel("u1"))).toBe(false);
  });

  it("خرابی publish (Redis قطع): تحویل محلی انجام می‌شود، throw نمی‌کند", async () => {
    const broker = new InMemoryPubSub();
    const A = instance(broker), B = instance(broker);
    const local = listener(), remote = listener();
    await A.hub.subscribe("u1", local.l);
    await B.hub.subscribe("u1", remote.l);
    A.pub.fail = true;
    await A.hub.publish("u1", ev("n1"));
    await tick();
    expect(local.got).toEqual(["n1"]);
    expect(remote.got).toEqual([]); // نمونه‌ی دیگر نمی‌رسد؛ با Last-Event-ID از DB جبران می‌شود
    expect(A.warns.length).toBe(1);
  });

  it("خرابی subscribe: حالت تنزل‌یافته؛ پس از بازگشت اتصال resubscribe و onResync", async () => {
    const broker = new InMemoryPubSub();
    const A = instance(broker);
    const x = listener();
    A.sub.failSubscribe = true;
    await A.hub.subscribe("u1", x.l); // throw نمی‌کند
    expect(A.hub.localCount("u1")).toBe(1);
    expect(A.sub.channels.has(userChannel("u1"))).toBe(false);

    A.sub.failSubscribe = false;
    A.sub.simulateReconnect();
    await tick();
    expect(A.sub.channels.has(userChannel("u1"))).toBe(true);
    expect(x.resyncs()).toBe(1);

    await A.hub.publish("u1", ev("n2"));
    await tick();
    expect(x.got).toEqual(["n2"]);
  });

  it("بازگشت اتصال: همه‌ی شنونده‌ها onResync می‌گیرند", async () => {
    const broker = new InMemoryPubSub();
    const A = instance(broker);
    const a = listener(), b = listener();
    await A.hub.subscribe("u1", a.l);
    await A.hub.subscribe("u2", b.l);
    A.sub.simulateReconnect();
    await tick();
    expect(a.resyncs()).toBe(1);
    expect(b.resyncs()).toBe(1);
  });

  it("پیام خراب یا کانال ناشناخته نادیده گرفته می‌شود و شنونده‌ها را نمی‌شکند", async () => {
    const broker = new InMemoryPubSub();
    const A = instance(broker);
    const x = listener();
    await A.hub.subscribe("u1", x.l);
    A.sub.deliver(userChannel("u1"), "{not json");
    A.sub.deliver(userChannel("u1"), JSON.stringify({ id: 5 }));
    A.sub.deliver("other:channel", JSON.stringify(ev("zzz")));
    expect(x.got).toEqual([]);
    expect(A.warns.length).toBe(2);
    A.sub.deliver(userChannel("u1"), JSON.stringify(ev("ok")));
    expect(x.got).toEqual(["ok"]);
  });

  it("استثنای یک شنونده بقیه را متوقف نمی‌کند", async () => {
    const broker = new InMemoryPubSub();
    const A = instance(broker);
    const good = listener();
    await A.hub.subscribe("u1", { onNotification: () => { throw new Error("boom"); }, onResync: () => undefined });
    await A.hub.subscribe("u1", good.l);
    await A.hub.publish("u1", ev("n1"));
    await tick();
    expect(good.got).toEqual(["n1"]);
  });
});
