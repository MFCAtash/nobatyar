import { describe, expect, it } from "vitest";
import { validateEvent, type StoredEvent } from "./outbox-events";
import { buildHandlers, statusChangeDelivery, type Delivery } from "./outbox-handlers";
import { backoffMs, decideFailure, MAX_ATTEMPTS, uuidFromKey } from "./outbox-policy";
import { InMemoryOutboxStore } from "./outbox-store";
import { OutboxRelay } from "./outbox.relay";
import { OutboxService, RecordingOutbox } from "./outbox.service";

const T0 = new Date("2026-11-13T10:00:00Z");
const ev = (id: string, type = "payment.settled", payload: unknown = { appointmentId: "a1", patientId: "p1" }) => ({ id, type, aggregateType: "payment", aggregateId: "pay1", payload, createdAt: new Date(T0.getTime() + Number(id.replace(/\D/g, "") || 0)) });

describe("policy", () => {
  it("backoff doubles from 5s and is capped at 15 min", () => {
    expect([1, 2, 3, 4].map(backoffMs)).toEqual([5_000, 10_000, 20_000, 40_000]);
    expect(backoffMs(30)).toBe(15 * 60_000);
  });
  it("retry until MAX_ATTEMPTS, then DEAD", () => {
    expect(decideFailure(1, T0)).toEqual({ status: "PENDING", availableAt: new Date(T0.getTime() + 5_000) });
    expect(decideFailure(MAX_ATTEMPTS, T0)).toEqual({ status: "DEAD" });
  });
  it("uuidFromKey is deterministic, UUID-shaped and key-sensitive", () => {
    const a = uuidFromKey("e1:patient");
    expect(a).toBe(uuidFromKey("e1:patient"));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(uuidFromKey("e1:doctor"));
  });
});

describe("event validation / writer", () => {
  it("rejects a payload with unknown or missing fields (programming error surfaces inside the tx)", () => {
    expect(() => validateEvent({ type: "payment.settled", aggregateType: "payment", aggregateId: "x", payload: { appointmentId: "a" } as never })).toThrow();
    expect(() => validateEvent({ type: "payment.settled", aggregateType: "payment", aggregateId: "x", payload: { appointmentId: "a", patientId: "p", name: "علی" } as never })).toThrow();
  });
  it("OutboxService writes through the given transaction handle", async () => {
    const written: unknown[] = [];
    const tx = { outboxEvent: { create: async (a: unknown) => void written.push(a) } };
    await new OutboxService().enqueue(tx, { type: "payment.settled", aggregateType: "payment", aggregateId: "pay1", payload: { appointmentId: "a1", patientId: "p1" } });
    expect(written).toEqual([{ data: { type: "payment.settled", aggregateType: "payment", aggregateId: "pay1", payload: { appointmentId: "a1", patientId: "p1" } } }]);
  });
  it("RecordingOutbox validates too", async () => {
    const o = new RecordingOutbox();
    await expect(o.enqueue({}, { type: "refund.processed", aggregateType: "refund", aggregateId: "r", payload: {} as never })).rejects.toThrow();
  });
});

describe("handlers", () => {
  const collect = () => { const out: Delivery[] = []; return { out, deliver: async (d: Delivery) => void out.push(d) }; };
  it("payment.settled ⇒ PAYMENT_SUCCESS to the patient with a deterministic id", async () => {
    const c = collect();
    const h = buildHandlers(c.deliver);
    await h["payment.settled"](ev("1") as StoredEvent);
    await h["payment.settled"](ev("1") as StoredEvent);
    expect(c.out).toHaveLength(2);
    expect(c.out[0]).toMatchObject({ userId: "p1", kind: "PAYMENT_SUCCESS", titleFa: "پرداخت موفق" });
    expect(c.out[0].notificationId).toBe(c.out[1].notificationId); // تحویل مجدد ⇒ همان id ⇒ INSERT ی تکراری بی‌اثر
  });
  it("status changes notify the right party (and stay silent when payment.settled already covers it)", () => {
    const s = (from: string, to: string) => statusChangeDelivery(ev("2", "appointment.status_changed") as StoredEvent, { appointmentId: "a1", patientId: "p1", doctorId: "d1", from, to, action: "X" });
    expect(s("PENDING_PAYMENT", "PENDING_CONFIRMATION")?.userId).toBe("d1");
    expect(s("PENDING_CONFIRMATION", "CONFIRMED")).toMatchObject({ userId: "p1", kind: "APPOINTMENT_CONFIRMED" });
    expect(s("PENDING_PAYMENT", "CONFIRMED")).toBeNull();
    expect(s("CONFIRMED", "CANCELLED_BY_DOCTOR")).toMatchObject({ userId: "p1", kind: "APPOINTMENT_CANCELLED" });
    expect(s("CONFIRMED", "CANCELLED_BY_PATIENT")).toMatchObject({ userId: "d1", kind: "APPOINTMENT_CANCELLED" });
    expect(s("PENDING_PAYMENT", "EXPIRED")?.userId).toBe("p1");
    expect(s("PENDING_CONFIRMATION", "EXPIRED")).toBeNull();
    expect(s("CONFIRMED", "IN_PROGRESS")).toBeNull();
  });
  it("a corrupt payload throws (relay will retry then mark DEAD)", async () => {
    const c = collect();
    await expect(buildHandlers(c.deliver)["payment.failed"](ev("3", "payment.failed", { nope: 1 }) as StoredEvent)).rejects.toThrow();
  });
});

describe("OutboxRelay", () => {
  const setup = (handler: (e: StoredEvent) => Promise<void>, now = { t: T0 }) => {
    const store = new InMemoryOutboxStore();
    const hooks = { processed: [] as string[], retried: [] as string[], dead: [] as string[] };
    const relay = new OutboxRelay(store, { "payment.settled": handler }, { onProcessed: (t) => hooks.processed.push(t), onRetry: (t) => hooks.retried.push(t), onDead: (t) => hooks.dead.push(t) }, () => now.t);
    return { store, relay, hooks, now };
  };

  it("delivers pending events once and marks them PROCESSED", async () => {
    const seen: string[] = [];
    const s = setup(async (e) => void seen.push(e.id));
    s.store.add(ev("1")); s.store.add(ev("2"));
    expect(await s.relay.runOnce()).toEqual({ claimed: 2, processed: 2, retried: 0, dead: 0 });
    expect(await s.relay.runOnce()).toMatchObject({ claimed: 0 });
    expect(seen).toEqual(["1", "2"]);
    expect(s.store.rows.every((r) => r.status === "PROCESSED")).toBe(true);
  });

  it("a failing handler is retried with backoff; recovery delivers it exactly once more", async () => {
    let fail = true; let calls = 0;
    const s = setup(async () => { calls++; if (fail) throw new Error("push down"); });
    s.store.add(ev("1"));
    expect(await s.relay.runOnce()).toMatchObject({ retried: 1 });
    expect(await s.relay.runOnce()).toMatchObject({ claimed: 0 }); // هنوز در backoff
    fail = false;
    s.now.t = new Date(T0.getTime() + 6_000);
    expect(await s.relay.runOnce()).toMatchObject({ processed: 1 });
    expect(calls).toBe(2);
    expect(s.store.rows[0].lastError).toBeNull();
  });

  it("after MAX_ATTEMPTS the event is DEAD with the last error, and the rest of the batch still flows", async () => {
    const s = setup(async (e) => { if (e.id === "1") throw new Error("always"); });
    s.store.add(ev("1")); s.store.add(ev("2"));
    for (let i = 0; i < MAX_ATTEMPTS; i++) { await s.relay.runOnce(); s.now.t = new Date(s.now.t.getTime() + 16 * 60_000); }
    const r1 = s.store.rows.find((r) => r.id === "1")!;
    expect(r1.status).toBe("DEAD");
    expect(r1.lastError).toContain("always");
    expect(s.store.rows.find((r) => r.id === "2")!.status).toBe("PROCESSED");
    expect(s.hooks.dead).toEqual(["payment.settled"]);
  });

  it("unknown type / missing handler is a failure, never silently dropped", async () => {
    const s = setup(async () => undefined);
    s.store.add(ev("1", "payment.refunded_xyz"));
    expect(await s.relay.runOnce()).toMatchObject({ retried: 1, processed: 0 });
    expect(s.store.rows[0].lastError).toContain("no handler");
  });

  it("two relays never take the same event (lease); a crashed relay's lease expires and the event is redelivered", async () => {
    const store = new InMemoryOutboxStore();
    store.add(ev("1"));
    const a = await store.claim(T0, 10);
    const b = await store.claim(T0, 10);
    expect([a.length, b.length]).toEqual([1, 0]);
    const later = await store.claim(new Date(T0.getTime() + 61_000), 10); // relay A مُرد؛ اجاره تمام شد
    expect(later).toHaveLength(1);
    expect(later[0].attempts).toBe(2);
  });

  it("purge only removes old PROCESSED events", async () => {
    const store = new InMemoryOutboxStore();
    store.add(ev("1")); store.add(ev("2"));
    await store.markProcessed("1", T0);
    expect(await store.purge(new Date(T0.getTime() + 8 * 24 * 3_600_000))).toBe(1);
    expect(store.rows.map((r) => r.id)).toEqual(["2"]);
  });
});
