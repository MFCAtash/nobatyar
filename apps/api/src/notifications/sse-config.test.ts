import { describe, expect, it } from "vitest";
import { loadSseConfig, SSE_HEARTBEAT_DEFAULT_SEC, streamLifetimeMs } from "./sse-config";

describe("loadSseConfig", () => {
  it("پیش‌فرض‌ها: heartbeat هر ۲۵ ثانیه", () => {
    const c = loadSseConfig({});
    expect(SSE_HEARTBEAT_DEFAULT_SEC).toBe(25);
    expect(c.heartbeatMs).toBe(25_000);
    expect(c.maxStreamsPerUser).toBe(8);
    expect(c.replayMax).toBe(200);
    expect(c.maxLifetimeMs).toBe(900_000);
  });

  it("مقدار env اعمال می‌شود", () => {
    const c = loadSseConfig({ SSE_HEARTBEAT_SEC: "10", SSE_MAX_STREAMS_PER_USER: "3", SSE_REPLAY_MAX: "50", SSE_MAX_LIFETIME_SEC: "60" });
    expect(c.heartbeatMs).toBe(10_000);
    expect(c.maxStreamsPerUser).toBe(3);
    expect(c.replayMax).toBe(50);
    expect(c.maxLifetimeMs).toBe(60_000);
  });

  it("مقدار نامعتبر ⇒ خطا (fail-fast)", () => {
    expect(() => loadSseConfig({ SSE_HEARTBEAT_SEC: "0" })).toThrow();
    expect(() => loadSseConfig({ SSE_HEARTBEAT_SEC: "60" })).toThrow(); // ≥ idle-timeout ی ۶۰ثانیه‌ی proxy ها
    expect(() => loadSseConfig({ SSE_HEARTBEAT_SEC: "abc" })).toThrow();
    expect(() => loadSseConfig({ SSE_MAX_STREAMS_PER_USER: "0" })).toThrow();
    expect(() => loadSseConfig({ SSE_REPLAY_MAX: "1.5" })).toThrow();
  });

  it("رشته‌ی خالی = پیش‌فرض", () => {
    expect(loadSseConfig({ SSE_HEARTBEAT_SEC: "  " }).heartbeatMs).toBe(25_000);
  });
});

describe("streamLifetimeMs", () => {
  const now = 1_000_000_000_000;
  it("بدون exp: سقف تنظیمی", () => expect(streamLifetimeMs(undefined, now, 900_000)).toBe(900_000));
  it("exp نزدیک‌تر از سقف: به‌اندازه‌ی باقی‌مانده‌ی توکن", () => {
    expect(streamLifetimeMs(now / 1000 + 120, now, 900_000)).toBe(120_000);
  });
  it("exp دورتر از سقف: سقف", () => {
    expect(streamLifetimeMs(now / 1000 + 5000, now, 900_000)).toBe(900_000);
  });
  it("توکن تازه منقضی‌شده: حداقل ۱ ثانیه (نه صفر/منفی)", () => {
    expect(streamLifetimeMs(now / 1000 - 3, now, 900_000)).toBe(1_000);
  });
});
