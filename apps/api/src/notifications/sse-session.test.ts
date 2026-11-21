import { describe, expect, it } from "vitest";
import { InMemoryPubSub } from "../redis/pubsub";
import { NotificationHub } from "./notification-hub";
import { SseSession } from "./sse-session";
import type { ReplayResult, SseSink, Timers } from "./sse-session";
import type { NotificationEvent } from "./sse-format";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const ev = (id: string): NotificationEvent => ({
  id, kind: "SYSTEM", titleFa: "t", bodyFa: "b", payload: {}, readAt: null, createdAt: "2026-01-01T00:00:00.000Z",
});

class FakeSink implements SseSink {
  out: string[] = [];
  ended = false;
  backlog = 0;
  throwOnWrite = false;
  private closeCbs: Array<() => void> = [];
  write(c: string) {
    if (this.throwOnWrite) throw new Error("EPIPE");
    this.out.push(c);
    return true;
  }
  end() { this.ended = true; }
  backlogBytes() { return this.backlog; }
  onClose(cb: () => void) { this.closeCbs.push(cb); }
  clientGone() { this.closeCbs.forEach((c) => c()); }
  get text() { return this.out.join(""); }
  /** رویدادهای notification ی نوشته‌شده (فقط idها) */
  ids() { return [...this.text.matchAll(/^id: (.+)$/gm)].map((m) => m[1]); }
}

class FakeTimers implements Timers {
  now = 0;
  private seq = 0;
  private intervals = new Map<number, { fn: () => void; ms: number; next: number }>();
  private timeouts = new Map<number, { fn: () => void; at: number }>();
  setInterval(fn: () => void, ms: number) { const h = ++this.seq; this.intervals.set(h, { fn, ms, next: this.now + ms }); return h; }
  clearInterval(h: unknown) { this.intervals.delete(h as number); }
  setTimeout(fn: () => void, ms: number) { const h = ++this.seq; this.timeouts.set(h, { fn, at: this.now + ms }); return h; }
  clearTimeout(h: unknown) { this.timeouts.delete(h as number); }
  get active() { return this.intervals.size + this.timeouts.size; }
  advance(ms: number) {
    const end = this.now + ms;
    for (;;) {
      let nextAt = Infinity;
      for (const i of this.intervals.values()) nextAt = Math.min(nextAt, i.next);
      for (const t of this.timeouts.values()) nextAt = Math.min(nextAt, t.at);
      if (nextAt > end) break;
      this.now = nextAt;
      for (const [h, i] of [...this.intervals]) if (i.next <= this.now) { i.next += i.ms; i.fn(); void h; }
      for (const [h, t] of [...this.timeouts]) if (t.at <= this.now) { this.timeouts.delete(h); t.fn(); }
    }
    this.now = end;
  }
}

function setup(opts: { replay?: (id: string) => Promise<ReplayResult>; lifetimeMs?: number; maxBacklogBytes?: number; stillValid?: () => Promise<boolean> } = {}) {
  const broker = new InMemoryPubSub();
  const pub = broker.publisher();
  const sub = broker.subscriber();
  const hub = new NotificationHub(pub, sub);
  const sink = new FakeSink();
  const timers = new FakeTimers();
  const order: string[] = [];
  const replays: string[] = [];
  const closed: string[] = [];
  const session = new SseSession({
    userId: "u1", sink, timers,
    hub: { subscribe: async (u, l) => { order.push("subscribe"); const off = await hub.subscribe(u, l); order.push("subscribed"); return off; } },
    replay: async (id) => { replays.push(id); order.push("replay"); return opts.replay ? opts.replay(id) : { status: "ok", items: [] }; },
    config: { heartbeatMs: 25_000, maxBacklogBytes: opts.maxBacklogBytes ?? 1024 },
    lifetimeMs: opts.lifetimeMs ?? 600_000,
    stillValid: opts.stillValid,
    onClosed: (r) => void closed.push(r),
  });
  const origWrite = sink.write.bind(sink);
  sink.write = (c) => { if (c.startsWith("event: ready")) order.push("ready"); return origWrite(c); };
  return { hub, pub, sub, sink, timers, session, order, replays, closed };
}

describe("SseSession", () => {
  it("نشست باطل‌شده (logout/تعلیق): در heartbeat بعدی اتصال بسته می‌شود", async () => {
    let valid = true;
    const t = setup({ stillValid: async () => valid });
    await t.session.start();
    t.timers.advance(25_000);
    await tick();
    expect(t.closed).toEqual([]);
    valid = false;
    t.timers.advance(25_000);
    await tick();
    expect(t.closed).toEqual(["revoked"]);
    expect(t.session.isClosed).toBe(true);
  });

  it("خطا در بازبررسی ابطال ⇒ اتصال نگه داشته می‌شود (خرابی Redis نباید همه را قطع کند)", async () => {
    const t = setup({ stillValid: async () => { throw new Error("redis down"); } });
    await t.session.start();
    t.timers.advance(25_000);
    await tick();
    expect(t.closed).toEqual([]);
  });

  it("ترتیب: subscribe (با تأیید) ⇒ ready ⇒ بازپخش", async () => {
    const t = setup();
    await t.session.start("123e4567-e89b-12d3-a456-426614174000");
    expect(t.order).toEqual(["subscribe", "subscribed", "ready", "replay"]);
    expect(t.sink.text.startsWith("retry: 3000\n\nevent: ready\n")).toBe(true);
  });

  it("بدون Last-Event-ID: بازپخش انجام نمی‌شود", async () => {
    const t = setup();
    await t.session.start();
    expect(t.replays).toEqual([]);
  });

  it("اعلان زنده با id و event=notification نوشته می‌شود", async () => {
    const t = setup();
    await t.session.start();
    await t.hub.publish("u1", ev("n1"));
    await tick();
    expect(t.sink.ids()).toEqual(["n1"]);
    expect(t.sink.text).toContain("event: notification\n");
    expect(t.session.lastEventId).toBe("n1");
  });

  it("heartbeat دقیقاً هر ۲۵ ثانیه", async () => {
    const t = setup();
    await t.session.start();
    const count = () => (t.sink.text.match(/^: hb$/gm) ?? []).length;
    t.timers.advance(24_999);
    expect(count()).toBe(0);
    t.timers.advance(1);
    expect(count()).toBe(1);
    t.timers.advance(50_000);
    expect(count()).toBe(3);
  });

  it("بازپخش: اعلان‌های از دست‌رفته به ترتیب، سپس زنده‌ها؛ تکراری حذف می‌شود", async () => {
    let release!: (r: ReplayResult) => void;
    const t = setup({ replay: () => new Promise<ReplayResult>((res) => (release = res)) });
    const started = t.session.start("123e4567-e89b-12d3-a456-426614174000");
    await tick();
    // حین بازپخش: n3 زنده می‌رسد (که در نتیجه‌ی بازپخش هم هست) و n4 فقط زنده
    await t.hub.publish("u1", ev("n3"));
    await t.hub.publish("u1", ev("n4"));
    await tick();
    expect(t.sink.ids()).toEqual([]); // هنوز بافر است
    release({ status: "ok", items: [ev("n1"), ev("n2"), ev("n3")] });
    await started;
    expect(t.sink.ids()).toEqual(["n1", "n2", "n3", "n4"]);
  });

  it("تکرار همان اعلان (publish ی تکراری) فقط یک‌بار نوشته می‌شود", async () => {
    const t = setup();
    await t.session.start();
    await t.hub.publish("u1", ev("n1"));
    await t.hub.publish("u1", ev("n1"));
    await tick();
    expect(t.sink.ids()).toEqual(["n1"]);
  });

  it("نتیجه‌ی resync ی سرویس ⇒ رویداد resync و هیچ اعلانی", async () => {
    const t = setup({ replay: async () => ({ status: "resync", reason: "gap" }) });
    await t.session.start("123e4567-e89b-12d3-a456-426614174000");
    expect(t.sink.text).toContain("event: resync\ndata: {\"reason\":\"gap\"}");
    expect(t.sink.ids()).toEqual([]);
  });

  it("خطای DB در بازپخش ⇒ resync (اتصال زنده می‌ماند)", async () => {
    const t = setup({ replay: async () => { throw new Error("db down"); } });
    await t.session.start("123e4567-e89b-12d3-a456-426614174000");
    expect(t.sink.text).toContain("replay_failed");
    expect(t.session.isClosed).toBe(false);
    await t.hub.publish("u1", ev("n1"));
    await tick();
    expect(t.sink.ids()).toEqual(["n1"]);
  });

  it("بازگشت Redis با cursor: بازپخش از آخرین id ی ارسالی", async () => {
    const t = setup({ replay: async () => ({ status: "ok", items: [ev("n2")] }) });
    await t.session.start();
    await t.hub.publish("u1", ev("n1"));
    await tick();
    t.sub.simulateReconnect();
    await tick(); await tick();
    expect(t.replays).toEqual(["n1"]);
    expect(t.sink.ids()).toEqual(["n1", "n2"]);
  });

  it("بازگشت Redis بدون cursor: کلاینت به REST فرستاده می‌شود", async () => {
    const t = setup();
    await t.session.start();
    t.sub.simulateReconnect();
    await tick(); await tick();
    expect(t.sink.text).toContain("redis_reconnect");
    expect(t.replays).toEqual([]);
  });

  it("سقف عمر: رویداد reconnect، بستن پاسخ، و unsubscribe", async () => {
    const t = setup({ lifetimeMs: 60_000 });
    await t.session.start();
    t.timers.advance(60_000);
    await tick();
    expect(t.sink.text).toContain("event: reconnect\ndata: {\"reason\":\"lifetime\"}");
    expect(t.sink.ended).toBe(true);
    expect(t.closed).toEqual(["lifetime"]);
    expect(t.sub.channels.size).toBe(0);
    expect(t.timers.active).toBe(0);
  });

  it("قطع از سمت کلاینت: unsubscribe، توقف تایمرها، onClosed", async () => {
    const t = setup();
    await t.session.start();
    t.sink.clientGone();
    await tick();
    expect(t.closed).toEqual(["client"]);
    expect(t.sub.channels.size).toBe(0);
    expect(t.timers.active).toBe(0);
    const before = t.sink.out.length;
    t.timers.advance(100_000);
    await t.hub.publish("u1", ev("n1"));
    await tick();
    expect(t.sink.out.length).toBe(before);
  });

  it("قطع کلاینت «وسط subscribe»: اشتراک نشت نمی‌کند", async () => {
    const t = setup();
    const p = t.session.start();
    t.sink.clientGone();
    await p;
    await tick();
    expect(t.sub.channels.size).toBe(0);
    expect(t.hub.activeChannels).toBe(0);
  });

  it("کلاینت کند: بافر خروجی از سقف گذشت ⇒ بسته می‌شود", async () => {
    const t = setup({ maxBacklogBytes: 100 });
    await t.session.start();
    t.sink.backlog = 5000;
    await t.hub.publish("u1", ev("n1"));
    await tick();
    expect(t.closed).toEqual(["slow_consumer"]);
    expect(t.sink.ended).toBe(true);
  });

  it("خطای نوشتن (EPIPE) ⇒ بسته می‌شود، نه crash", async () => {
    const t = setup();
    await t.session.start();
    t.sink.throwOnWrite = true;
    await t.hub.publish("u1", ev("n1"));
    await tick();
    expect(t.closed).toEqual(["write_error"]);
  });

  it("close چندبار صدا زده شود فقط یک‌بار اثر دارد", async () => {
    const t = setup();
    await t.session.start();
    await Promise.all([t.session.close("shutdown"), t.session.close("shutdown"), t.session.close("client")]);
    expect(t.closed).toEqual(["shutdown"]);
    expect((t.sink.text.match(/event: reconnect/g) ?? []).length).toBe(1);
  });
});
