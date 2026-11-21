import { describe, expect, it } from "vitest";
import { RedisSubscriber } from "./pubsub";
import type { RedisSubLike } from "./pubsub";

/** ioredis ی جعلی با EventEmitter ی ساده */
function fakeRedis() {
  const handlers = new Map<string, Array<(...a: never[]) => void>>();
  const calls: string[] = [];
  const r: RedisSubLike = {
    subscribe: async (...c) => void calls.push(`sub:${c.join(",")}`),
    unsubscribe: async (...c) => void calls.push(`unsub:${c.join(",")}`),
    on: (e, cb) => void (handlers.get(e) ?? handlers.set(e, []).get(e)!).push(cb),
    quit: async () => void calls.push("quit"),
  };
  const emit = (e: string, ...a: unknown[]) => (handlers.get(e) ?? []).forEach((h) => (h as (...x: unknown[]) => void)(...a));
  return { r, emit, calls };
}

describe("RedisSubscriber", () => {
  it("پیام‌ها به callback ها می‌رسد", () => {
    const f = fakeRedis();
    const s = new RedisSubscriber(f.r);
    const got: string[] = [];
    s.onMessage((c, m) => void got.push(`${c}|${m}`));
    f.emit("message", "ch", "hello");
    expect(got).toEqual(["ch|hello"]);
  });

  it("onReconnect فقط برای «ready پس از قطعی» (نه ready ی اولیه)", () => {
    const f = fakeRedis();
    const s = new RedisSubscriber(f.r);
    let n = 0;
    s.onReconnect(() => void n++);
    f.emit("ready");               // اتصال اولیه
    expect(n).toBe(0);
    f.emit("reconnecting");
    f.emit("ready");               // بازگشت
    expect(n).toBe(1);
    f.emit("ready");               // ready ی بی‌ربط
    expect(n).toBe(1);
  });

  it("subscribe/unsubscribe و خطا", async () => {
    const f = fakeRedis();
    const errs: string[] = [];
    const s = new RedisSubscriber(f.r, (e) => void errs.push(e.message));
    await s.subscribe("a");
    await s.unsubscribe("a");
    f.emit("error", new Error("econnreset"));
    expect(f.calls).toEqual(["sub:a", "unsub:a"]);
    expect(errs).toEqual(["econnreset"]);
    await s.onModuleDestroy();
    expect(f.calls).toContain("quit");
  });
});
