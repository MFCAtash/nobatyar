import { describe, expect, it } from "vitest";
import { canonicalJson, decide, fingerprint, parseKey, shouldStore, type StoredKey } from "./idempotency-policy";
import { IdempotencyConflict, runIdempotent, type RunInput } from "./idempotency-runner";
import { InMemoryIdempotencyStore } from "./idempotency-store";

const KEY = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const base: RunInput = { userId: "u1", method: "POST", routeTemplate: "/payments/initiate", url: "/api/v1/payments/initiate", body: { appointmentId: "a1" }, key: KEY, successStatus: 201 };

describe("parseKey", () => {
  it("required vs optional", () => {
    expect(parseKey(undefined, true)).toEqual({ ok: false, code: "idempotency_key_required" });
    expect(parseKey(undefined, false)).toEqual({ ok: true, key: null });
  });
  it("rejects short, long, odd characters and repeated headers", () => {
    for (const bad of ["short", "x".repeat(129), "has space in it 1234567", "emoji-🙂-1234567890123"]) expect(parseKey(bad, true).ok).toBe(false);
    expect(parseKey([KEY, KEY], true).ok).toBe(false);
    expect(parseKey(KEY, true)).toEqual({ ok: true, key: KEY });
  });
});

describe("fingerprint", () => {
  it("ignores key order but not values, url or method", () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
    const a = fingerprint("POST", "/x", { a: 1, b: 2 });
    expect(fingerprint("post", "/x", { b: 2, a: 1 })).toBe(a);
    expect(fingerprint("POST", "/x", { a: 1, b: 3 })).not.toBe(a);
    expect(fingerprint("POST", "/y", { a: 1, b: 2 })).not.toBe(a);
    expect(fingerprint("PUT", "/x", { a: 1, b: 2 })).not.toBe(a);
  });
});

describe("decide", () => {
  const now = new Date("2026-11-13T10:00:00Z");
  const row = (o: Partial<StoredKey> = {}): StoredKey => ({ fingerprint: "f", state: "IN_PROGRESS", lockedUntil: new Date(now.getTime() + 30_000), expiresAt: new Date(now.getTime() + 3_600_000), statusCode: null, response: null, ...o });
  it("covers every branch", () => {
    expect(decide(null, "f", now).kind).toBe("execute");
    expect(decide(row({ expiresAt: new Date(now.getTime() - 1) }), "f", now).kind).toBe("execute");
    expect(decide(row(), "other", now).kind).toBe("mismatch");
    expect(decide(row({ state: "COMPLETED", statusCode: 201, response: { ok: 1 } }), "f", now)).toEqual({ kind: "replay", status: 201, body: { ok: 1 } });
    expect(decide(row(), "f", now)).toEqual({ kind: "in_progress", retryAfterSec: 30 });
    expect(decide(row({ lockedUntil: new Date(now.getTime() - 1) }), "f", now).kind).toBe("takeover");
  });
  it("stores only small 2xx responses", () => {
    expect(shouldStore(200, { a: 1 })).toBe(true);
    expect(shouldStore(400, {})).toBe(false);
    expect(shouldStore(200, "x".repeat(70_000))).toBe(false);
  });
});

describe("runIdempotent", () => {
  it("executes once and replays the stored response for the same key", async () => {
    const store = new InMemoryIdempotencyStore();
    let calls = 0;
    const handler = async () => { calls++; return { paymentUrl: "https://gw/pay/1" }; };
    const r1 = await runIdempotent(store, base, handler);
    const r2 = await runIdempotent(store, base, handler);
    expect(calls).toBe(1);
    expect(r1.replayed).toBe(false);
    expect(r2).toEqual({ replayed: true, body: { paymentUrl: "https://gw/pay/1" } });
  });
  it("two concurrent requests with the same key: one runs, the other gets 409-in-progress", async () => {
    const store = new InMemoryIdempotencyStore();
    let calls = 0; let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const slow = async () => { calls++; await gate; return { ok: true }; };
    const first = runIdempotent(store, base, slow);
    await Promise.resolve();
    await expect(runIdempotent(store, base, slow)).rejects.toBeInstanceOf(IdempotencyConflict);
    release();
    await first;
    expect(calls).toBe(1);
  });
  it("same key with a different body/url ⇒ idempotency_key_reuse", async () => {
    const store = new InMemoryIdempotencyStore();
    await runIdempotent(store, base, async () => ({ ok: 1 }));
    await expect(runIdempotent(store, { ...base, body: { appointmentId: "a2" } }, async () => ({ ok: 2 }))).rejects.toMatchObject({ code: "idempotency_key_reuse" });
    await expect(runIdempotent(store, { ...base, url: "/api/v1/payments/initiate?x=1" }, async () => ({ ok: 2 }))).rejects.toMatchObject({ code: "idempotency_key_reuse" });
  });
  it("handler failure releases the lock so a retry with the same key re-executes", async () => {
    const store = new InMemoryIdempotencyStore();
    await expect(runIdempotent(store, base, async () => { throw new Error("gateway down"); })).rejects.toThrow();
    expect(store.size).toBe(0);
    const r = await runIdempotent(store, base, async () => ({ ok: "retry" }));
    expect(r.replayed).toBe(false);
  });
  it("keys are isolated per user and per route", async () => {
    const store = new InMemoryIdempotencyStore();
    let calls = 0;
    const h = async () => ({ n: ++calls });
    await runIdempotent(store, base, h);
    await runIdempotent(store, { ...base, userId: "u2" }, h);
    await runIdempotent(store, { ...base, routeTemplate: "/payments/verify", url: "/api/v1/payments/verify" }, h);
    expect(calls).toBe(3);
  });
  it("a crashed holder (expired lock) can be taken over; completed rows expire after 24h", async () => {
    const store = new InMemoryIdempotencyStore();
    let t = new Date("2026-11-13T10:00:00Z");
    const now = () => t;
    let release!: () => void;
    const stuck = runIdempotent(store, base, () => new Promise<{ x: number }>((r) => { release = () => r({ x: 1 }); }), now);
    await Promise.resolve();
    t = new Date(t.getTime() + 3 * 60_000);
    const r = await runIdempotent(store, base, async () => ({ x: 2 }), now);
    expect(r).toEqual({ replayed: false, body: { x: 2 } });
    release(); await stuck;
    t = new Date(t.getTime() + 25 * 3_600_000);
    expect(await store.purgeExpired(t)).toBe(1);
  });
});
