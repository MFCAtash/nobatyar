/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { loadAuthConfig } from "../config/auth.config";
import { PushAppointmentNotifier } from "../notifications/push-notifier";
import { assertSafePayload, buildReminderPayload } from "./push-payload";
import { loadPushConfig } from "./push.config";
import { PushService } from "./push.service";
import type { PushSender, PushSendResult } from "./push.sender";

const PUB = "B".repeat(87), PRIV = "C".repeat(43);
const ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("loadPushConfig", () => {
  it("هیچ‌کدام ⇒ خاموش", () => expect(loadPushConfig({} as any).enabled).toBe(false));
  it("هر سه ⇒ روشن", () => {
    const c = loadPushConfig({ VAPID_PUBLIC_KEY: PUB, VAPID_PRIVATE_KEY: PRIV, VAPID_SUBJECT: "mailto:ops@example.ir" } as any);
    expect(c.enabled).toBe(true);
  });
  it("نیمه‌کاره/قالب نامعتبر ⇒ خطا", () => {
    expect(() => loadPushConfig({ VAPID_PUBLIC_KEY: PUB } as any)).toThrow(/all be set/);
    expect(() => loadPushConfig({ VAPID_PUBLIC_KEY: "short", VAPID_PRIVATE_KEY: PRIV, VAPID_SUBJECT: "mailto:a@b.ir" } as any)).toThrow(/87-char/);
    expect(() => loadPushConfig({ VAPID_PUBLIC_KEY: PUB, VAPID_PRIVATE_KEY: PRIV, VAPID_SUBJECT: "http://x.ir" } as any)).toThrow(/VAPID_SUBJECT/);
  });
});

describe("buildReminderPayload — بدون داده‌ی سلامت", () => {
  it("متن عمومی و URL نسبی", () => {
    for (const k of ["24h", "1h"] as const) {
      const p = buildReminderPayload(k, ID);
      expect(p.url).toBe(`/appointments/${ID}`);
      expect(() => assertSafePayload(p)).not.toThrow();
      expect(/دکتر|بیمار|تخصص|نسخه|بیماری|علت/.test(p.title + p.body)).toBe(false);
    }
  });
  it("شناسه‌ی نامعتبر یا URL خارجی ⇒ رد", () => {
    expect(() => buildReminderPayload("1h", "../x")).toThrow();
    const p = buildReminderPayload("1h", ID);
    for (const url of ["https://evil.example/x", "//evil.example", "javascript:alert(1)", "/a?x=1"]) expect(() => assertSafePayload({ ...p, url })).toThrow();
  });
});

describe("E2E hooks در production ممنوع‌اند (fail-closed)", () => {
  const base = { NODE_ENV: "production" } as any;
  it("SMS_PROVIDER=memory و E2E_TEST_HOOKS در production ⇒ خطا", () => {
    expect(() => loadAuthConfig({ ...base, SMS_PROVIDER: "memory" })).toThrow(/memory is not allowed in production/);
    expect(() => loadAuthConfig({ ...base, SMS_PROVIDER: "kavenegar", KAVENEGAR_API_KEY: "k", KAVENEGAR_TEMPLATE: "t", E2E_TEST_HOOKS: "true" })).toThrow(/E2E_TEST_HOOKS/);
  });
  it("hook بدون provider ی memory ⇒ خطا؛ مقدار مبهم ⇒ خطا", () => {
    expect(() => loadAuthConfig({ NODE_ENV: "test", E2E_TEST_HOOKS: "true" } as any)).toThrow(/requires SMS_PROVIDER=memory/);
    expect(() => loadAuthConfig({ NODE_ENV: "test", E2E_TEST_HOOKS: "yes" } as any)).toThrow(/exactly/);
  });
});

// ───────── PushService با DB و crypto جعلی ─────────
function world(sender: PushSender | null, cfgOver: Record<string, unknown> = {}) {
  const subs: any[] = [];
  const hit = (r: any, w: any) => Object.entries(w).every(([k, v]) => k === "NOT" ? (r.endpointHash !== (v as any).endpointHash) : r[k] === v);
  const table = {
    count: async ({ where }: any) => subs.filter((r) => hit(r, where)).length,
    findUnique: async ({ where }: any) => subs.find((r) => hit(r, where)) ?? null,
    findMany: async ({ where }: any) => subs.filter((r) => hit(r, where)),
    create: async ({ data }: any) => void subs.push({ failureCount: 0, ...data }),
    update: async ({ where, data }: any) => void Object.assign(subs.find((r) => r.id === where.id), data),
    updateMany: async ({ where, data }: any) => void subs.filter((r) => hit(r, where)).forEach((r) => { for (const [k, v] of Object.entries<any>(data)) r[k] = v && v.increment ? r[k] + v.increment : v; }),
    deleteMany: async ({ where }: any) => { for (const r of subs.filter((x) => hit(x, where))) subs.splice(subs.indexOf(r), 1); },
  };
  const prisma = { withContext: async (_c: unknown, fn: any) => fn({ pushSubscription: table }) };
  const crypto = { blindIndex: (v: string) => `h:${v}`, encrypt: (v: string) => Buffer.from(v), decrypt: (b: Uint8Array) => Buffer.from(b) };
  const cfg = { enabled: true, publicKey: PUB, maxPerUser: 2, ...cfgOver };
  return { subs, svc: new PushService(prisma as any, crypto as any, cfg as any, sender) };
}
const sub = (n: number) => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: "p".repeat(30), auth: "a".repeat(12) } });
const user = { id: "u1", role: "PATIENT" } as any;

describe("PushService", () => {
  it("اشتراک رمزنگاری‌شده ذخیره می‌شود (endpoint خام در DB نیست) و سقف هر کاربر اعمال می‌شود", async () => {
    const { svc, subs } = world({ send: async () => ({ ok: true }) });
    await svc.subscribe(user, sub(1));
    await svc.subscribe(user, sub(1)); // تکراری ⇒ به‌روزرسانی
    await svc.subscribe(user, sub(2));
    expect(subs).toHaveLength(2);
    expect(subs[0].endpointHash).toBe("h:https://push.example/1");
    await expect(svc.subscribe(user, sub(3))).rejects.toThrow(/too_many_push_subscriptions/);
  });

  it("خاموش ⇒ 503 و ارسال بی‌اثر", async () => {
    const { svc } = world(null, { enabled: false });
    await expect(svc.subscribe(user, sub(1))).rejects.toThrow(/push_disabled/);
    expect(() => svc.publicKey()).toThrow(/push_disabled/);
    expect(await svc.sendToUser("u1", buildReminderPayload("1h", ID))).toEqual({ sent: 0, removed: 0 });
  });

  it("ارسال: موفق، gone (۴۱۰) حذف می‌شود، شکست موقت شمارنده را بالا می‌برد", async () => {
    const results: PushSendResult[] = [{ ok: true }, { ok: false, gone: true, status: 410 }, { ok: false, gone: false, status: 500 }];
    const seen: string[] = [];
    const { svc, subs } = world({ send: async (t, json) => { seen.push(t.endpoint + "|" + json.length); return results.shift()!; } }, { maxPerUser: 5 });
    for (const n of [1, 2, 3]) await svc.subscribe(user, sub(n));
    const r = await svc.sendToUser("u1", buildReminderPayload("1h", ID));
    expect(r).toEqual({ sent: 1, removed: 1 });
    expect(subs).toHaveLength(2);
    expect(subs.find((s) => s.endpointHash.endsWith("/3")).failureCount).toBe(1);
    expect(seen).toHaveLength(3);
  });

  it("پس از ۵ شکست پیاپی اشتراک پاک می‌شود", async () => {
    const { svc, subs } = world({ send: async () => ({ ok: false, gone: false, status: 500 }) });
    await svc.subscribe(user, sub(1));
    for (let i = 0; i < 5; i++) await svc.sendToUser("u1", buildReminderPayload("1h", ID));
    expect(subs).toHaveLength(0);
  });

  it("پیلودِ ناامن هرگز فرستاده نمی‌شود", async () => {
    let called = false;
    const { svc } = world({ send: async () => { called = true; return { ok: true }; } });
    await svc.subscribe(user, sub(1));
    await expect(svc.sendToUser("u1", { ...buildReminderPayload("1h", ID), url: "https://evil.example" })).rejects.toThrow();
    expect(called).toBe(false);
  });
});

describe("PushAppointmentNotifier", () => {
  it("برای بیمار و پزشک هم اعلان درون‌برنامه‌ای هم پوش؛ خطای پوش job را نمی‌شکند", async () => {
    const notes: string[] = [], pushed: string[] = [];
    const n = new PushAppointmentNotifier({ push: async (u: string, i: any) => void notes.push(`${u}:${i.kind}:${i.bodyFa}`) } as any, { sendToUser: async (u: string) => { pushed.push(u); if (u === "d1") throw new Error("boom"); } } as any);
    await n.reminder({ appointmentId: ID, patientId: "p1", doctorId: "d1", startsAt: new Date(), kind: "1h" });
    expect(notes).toHaveLength(2);
    expect(pushed).toEqual(["p1", "d1"]);
    expect(notes.every((x) => x.includes("APPOINTMENT_REMINDER"))).toBe(true);
  });
});
