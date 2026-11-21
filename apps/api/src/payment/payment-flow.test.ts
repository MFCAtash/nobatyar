/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * تست رفتاری هسته‌ی تسویه و job بازبینی روی یک DB «درون‌حافظه‌ای» ساده (بدون Postgres).
 * رقابت‌ها با همان معناشناسی updateMany ی شرطی شبیه‌سازی می‌شوند که Postgres در تراکنش می‌دهد.
 * قراردادهای SQL (RLS، تریگر) در apps/api/test/payment-gateway.int.test.ts روی Postgres واقعی تست می‌شوند.
 */
import { RecordingOutbox } from "../outbox/outbox.service";
import { describe, expect, it } from "vitest";
import { ConflictException } from "@nestjs/common";
import { CircuitBreaker } from "./gateway/circuit-breaker";
import { GatewayError } from "./gateway/gateway";
import type { InquiryOutcome, PaymentGateway, VerifyOutcome } from "./gateway/gateway";
import { GatewayRegistry } from "./gateway/gateway-registry";
import { loadPaymentConfig } from "./payment.config";
import { PaymentReconciler } from "./payment-reconciler";
import { PaymentSettlement } from "./payment-settlement";

// ───────────── DB جعلی ─────────────
type Row = Record<string, any>;
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === "OR") return (v as Row[]).some((w) => matches(row, w));
    const x = row[k];
    if (v === null) return x === null || x === undefined;
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if ("in" in v) return v.in.includes(x);
      if ("lte" in v && !(x <= v.lte)) return false;
      if ("lt" in v && !(x < v.lt)) return false;
      if ("gte" in v && !(x >= v.gte)) return false;
      return true;
    }
    return x === v;
  });
}
const apply = (row: Row, data: Row) => {
  for (const [k, v] of Object.entries(data)) row[k] = v && typeof v === "object" && "increment" in v ? (row[k] ?? 0) + v.increment : v;
};
class Table {
  rows: Row[] = [];
  constructor(private readonly join?: (r: Row) => Row) {}
  private view(r: Row) { return this.join ? { ...r, ...this.join(r) } : r; }
  async findUnique({ where }: { where: Row }) { const r = this.rows.find((x) => matches(x, where)); return r ? this.view(r) : null; }
  async findMany({ where = {}, take }: { where?: Row; take?: number } = {}) { return this.rows.filter((x) => matches(x, where)).slice(0, take ?? 1e9).map((r) => this.view(r)); }
  async updateMany({ where, data }: { where: Row; data: Row }) { const hit = this.rows.filter((x) => matches(x, where)); hit.forEach((r) => apply(r, data)); return { count: hit.length }; }
  async create({ data }: { data: Row }) { this.rows.push({ ...data }); return data; }
}

class World {
  appointments = new Map<string, { status: string; patientId: string }>();
  attempts: Table;
  payments: Table;
  refunds = new Table();
  audits: string[] = [];
  outbox = new RecordingOutbox();
  /** رویدادهای Outbox ی ثبت‌شده (به‌جای اعلان مستقیم) */
  get notes() { return this.outbox.events.map((e) => ({ kind: e.type })); }
  applyCalls: string[] = [];
  now = new Date("2026-03-01T12:00:00Z");
  /** اگر true، apply() شبیه‌سازی می‌کند که نوبت در همین لحظه منقضی شد. */
  expireOnApply = false;

  constructor() {
    this.payments = new Table((r) => ({ appointment: this.appointments.get(r.appointmentId)! }));
    this.attempts = new Table((r) => ({ payment: this.payments.rows.find((p) => p.id === r.paymentId) && { ...this.payments.rows.find((p) => p.id === r.paymentId)!, appointment: this.appointments.get(this.payments.rows.find((p) => p.id === r.paymentId)!.appointmentId)! } }));
  }
  prisma = {
    withContext: async (_c: unknown, fn: (tx: any) => Promise<any>) => fn({ paymentAttempt: this.attempts, payment: this.payments, refund: this.refunds }),
  };
  audit = { logIn: async (_tx: unknown, e: { action: string }) => void this.audits.push(e.action) };
  appts = {
    apply: async (_a: unknown, id: string, action: string) => {
      this.applyCalls.push(`${id}:${action}`);
      const a = this.appointments.get(id)!;
      if (this.expireOnApply) { a.status = "EXPIRED"; throw new ConflictException({ error: "invalid_state" }); }
      if (a.status !== "PENDING_PAYMENT") throw new ConflictException({ error: "invalid_state" });
      a.status = "PENDING_CONFIRMATION";
    },
  };

  seed(opts: { apptStatus?: string; attemptStatus?: string; payStatus?: string; amount?: bigint; createdAgoMin?: number; gateway?: string } = {}) {
    const n = this.payments.rows.length + 1;
    const apptId = `appt-${n}`, payId = `pay-${n}`, attId = `att-${n}`;
    this.appointments.set(apptId, { status: opts.apptStatus ?? "PENDING_PAYMENT", patientId: `patient-${n}` });
    this.payments.rows.push({ id: payId, appointmentId: apptId, status: opts.payStatus ?? "INITIATED", amountRial: opts.amount ?? 1_000_000n, appointmentSyncedAt: null, paidAt: null });
    this.attempts.rows.push({
      id: attId, paymentId: payId, gateway: opts.gateway ?? "ZARINPAL", authority: `AUTH${n}`, amountRial: opts.amount ?? 1_000_000n,
      status: opts.attemptStatus ?? "INITIATED", createdAt: new Date(this.now.getTime() - (opts.createdAgoMin ?? 20) * 60_000), lastCheckedAt: null, checkCount: 0,
    });
    return { apptId, payId, attId };
  }
  extraAttempt(payId: string, status: string, authority: string) {
    this.attempts.rows.push({ id: `x-${authority}`, paymentId: payId, gateway: "ZARINPAL", authority, amountRial: 1_000_000n, status, createdAt: new Date(this.now.getTime() - 3_600_000), lastCheckedAt: null, checkCount: 0 });
  }
  att = (id: string) => this.attempts.rows.find((a) => a.id === id)!;
  pay = (id: string) => this.payments.rows.find((p) => p.id === id)!;
}

interface Script { verify?: VerifyOutcome | Error; inquire?: InquiryOutcome | Error; calls: string[] }
function scripted(s: Script): PaymentGateway {
  return {
    name: "zarinpal",
    async request() { throw new Error("not used"); },
    async verify() { s.calls.push("verify"); const r = s.verify!; if (r instanceof Error) throw r; return r; },
    async inquire() { s.calls.push("inquire"); const r = s.inquire ?? { kind: "UNKNOWN", code: "?" }; if (r instanceof Error) throw r; return r as InquiryOutcome; },
  };
}
const PAID = (over: Partial<Extract<VerifyOutcome, { kind: "PAID" }>> = {}): VerifyOutcome => ({ kind: "PAID", refId: "R1", alreadyVerified: false, ...over });
const MID = "11111111-2222-3333-4444-555555555555";

function setup(script: Script, env: Record<string, string> = {}) {
  const w = new World();
  const cfg = loadPaymentConfig({ NODE_ENV: "test", PAYMENT_GATEWAY: "zarinpal", ZARINPAL_MERCHANT_ID: MID, ZARINPAL_SANDBOX: "true", ...env } as NodeJS.ProcessEnv);
  const registry = new GatewayRegistry([scripted(script)], { primary: "zarinpal", fallbacks: [], breaker: new CircuitBreaker(3, 1000), isProduction: false });
  const st = new PaymentSettlement(w.prisma as any, w.audit as any, w.outbox as any, w.appts as any, registry, cfg);
  const rec = new PaymentReconciler(w.prisma as any, st, cfg);
  return { w, st, rec, cfg };
}

describe("تسویه — مسیر موفق", () => {
  it("verify موفق ⇒ attempt VERIFIED، Payment PAID، نوبت جلو می‌رود، اعلان و audit ثبت می‌شود", async () => {
    const calls: string[] = [];
    const { w, st } = setup({ verify: PAID({ amountRial: 1_000_000n }), calls });
    const { apptId, payId, attId } = w.seed();
    const r = await st.settle(attId, "callback", "patient-1", w.now);
    expect(r.state).toBe("PAID");
    expect(w.att(attId).status).toBe("VERIFIED");
    expect(w.att(attId).refId).toBe("R1");
    expect(w.pay(payId).status).toBe("PAID");
    expect(w.pay(payId).gateway).toBe("ZARINPAL");
    expect(w.pay(payId).appointmentSyncedAt).toEqual(w.now);
    expect(w.appointments.get(apptId)!.status).toBe("PENDING_CONFIRMATION");
    expect(w.applyCalls).toEqual([`${apptId}:PAYMENT_SUCCEEDED`]);
    expect(w.audits).toContain("payment.verified");
    expect(w.notes.map((n) => n.kind)).toEqual(["payment.settled"]);
    expect(calls).toEqual(["verify"]);
  });

  it("ایدمپوتنت: تسویه‌ی دوباره هیچ اثر دومی ندارد", async () => {
    const { w, st } = setup({ verify: PAID(), calls: [] });
    const { attId } = w.seed();
    await st.settle(attId, "callback", null, w.now);
    const again = await st.settle(attId, "reconcile", null, w.now);
    expect(again.state).toBe("PAID");
    expect(w.applyCalls).toHaveLength(1);
    expect(w.notes).toHaveLength(1);
  });

  it("callback و job هم‌زمان ⇒ فقط یک برنده؛ نوبت یک‌بار تأیید می‌شود", async () => {
    const { w, st } = setup({ verify: PAID(), calls: [] });
    const { attId } = w.seed();
    const [a, b] = await Promise.all([st.settle(attId, "callback", "patient-1", w.now), st.settle(attId, "reconcile", null, w.now)]);
    expect([a.state, b.state]).toEqual(["PAID", "PAID"]);
    expect(w.applyCalls).toHaveLength(1);
    expect(w.audits.filter((x) => x === "payment.verified")).toHaveLength(1);
    expect(w.notes).toHaveLength(1);
  });
});

describe("تسویه — مبلغ و جعل", () => {
  it("مبلغ درگاه با DB فرق دارد ⇒ MISMATCH؛ هرگز تأیید نمی‌شود", async () => {
    const { w, st } = setup({ verify: PAID({ amountRial: 10_000n }), calls: [] });
    const { apptId, payId, attId } = w.seed();
    const r = await st.settle(attId, "callback", "patient-1", w.now);
    expect(r).toEqual({ state: "REVIEW", code: "gateway_amount_mismatch" });
    expect(w.att(attId).status).toBe("MISMATCH");
    expect(w.pay(payId).status).toBe("INITIATED");
    expect(w.appointments.get(apptId)!.status).toBe("PENDING_PAYMENT");
    expect(w.applyCalls).toHaveLength(0);
    expect(w.audits).toContain("payment.needs_review");
  });

  it("MISMATCH صریح از درگاه (مثل -50 زرین‌پال) ⇒ بررسی دستی", async () => {
    const { w, st } = setup({ verify: { kind: "MISMATCH", code: "-50" }, calls: [] });
    const { attId } = w.seed();
    expect((await st.settle(attId, "callback", null, w.now)).state).toBe("REVIEW");
    expect(w.att(attId).status).toBe("MISMATCH");
  });

  it("تلاشِ MISMATCH دیگر خودکار تأیید نمی‌شود (حتی اگر درگاه بعداً PAID بگوید)", async () => {
    const calls: string[] = [];
    const { w, st } = setup({ verify: PAID(), calls });
    const { attId } = w.seed({ attemptStatus: "MISMATCH" });
    expect((await st.settle(attId, "reconcile", null, w.now)).state).toBe("REVIEW");
    expect(calls).toEqual([]);
  });

  it("پارامتر Status مرورگر در تصمیم نقشی ندارد: درگاه NOT_PAID می‌گوید ⇒ پرداخت ثبت نمی‌شود", async () => {
    const calls: string[] = [];
    const { w, st } = setup({ verify: { kind: "NOT_PAID", code: "-51" }, inquire: { kind: "PENDING" }, calls });
    const { payId, attId } = w.seed({ createdAgoMin: 3 });
    const r = await st.settle(attId, "callback", "patient-1", w.now);
    expect(r.state).toBe("PENDING");
    expect(w.pay(payId).status).toBe("INITIATED");
    expect(w.att(attId).status).toBe("INITIATED"); // کاربر شاید هنوز در بانک است؛ «نسوزان»
    expect(calls).toEqual(["verify", "inquire"]);
  });

  it("amount تلاش با Payment فرق دارد ⇒ MISMATCH", async () => {
    const { w, st } = setup({ verify: PAID(), calls: [] });
    const { attId, payId } = w.seed();
    w.pay(payId).amountRial = 2_000_000n;
    expect((await st.settle(attId, "callback", null, w.now)).code).toBe("attempt_amount_differs_from_payment");
  });
});

describe("تسویه — ناموفق/نامعلوم", () => {
  it("استعلام FAILED ⇒ attempt و Payment ناموفق (و اعلان برای job)", async () => {
    const { w, st } = setup({ verify: { kind: "NOT_PAID", code: "-51" }, inquire: { kind: "FAILED", code: "FAILED" }, calls: [] });
    const { payId, attId } = w.seed();
    const r = await st.settle(attId, "reconcile", null, w.now);
    expect(r.state).toBe("FAILED");
    expect(w.att(attId).status).toBe("FAILED");
    expect(w.pay(payId).status).toBe("FAILED");
    expect(w.notes.map((n) => n.kind)).toEqual(["payment.failed"]);
  });

  it("اگر تلاش دیگری هنوز زنده است، Payment ناموفق نمی‌شود", async () => {
    const { w, st } = setup({ verify: { kind: "NOT_PAID", code: "-51" }, inquire: { kind: "FAILED", code: "FAILED" }, calls: [] });
    const { payId, attId } = w.seed();
    w.extraAttempt(payId, "INITIATED", "AUTH-OTHER");
    await st.settle(attId, "callback", "patient-1", w.now);
    expect(w.att(attId).status).toBe("FAILED");
    expect(w.pay(payId).status).toBe("INITIATED");
  });

  it("در بانک و کهنه‌تر از مهلت ⇒ EXPIRED", async () => {
    const { w, st } = setup({ verify: { kind: "NOT_PAID", code: "-51" }, inquire: { kind: "PENDING" }, calls: [] });
    const { attId } = w.seed({ createdAgoMin: 25 * 60 });
    expect((await st.settle(attId, "reconcile", null, w.now)).state).toBe("FAILED");
    expect(w.att(attId).status).toBe("EXPIRED");
  });

  it("خطای شبکه‌ی درگاه ⇒ PENDING بدون هیچ تغییر وضعیت", async () => {
    const { w, st } = setup({ verify: new GatewayError("zarinpal", "unavailable", "timeout"), calls: [] });
    const { payId, attId } = w.seed();
    expect((await st.settle(attId, "reconcile", null, w.now)).state).toBe("PENDING");
    expect(w.att(attId).status).toBe("INITIATED");
    expect(w.pay(payId).status).toBe("INITIATED");
  });

  it("وضعیت نامعلوم پس از مهلت ⇒ علامت‌گذاری برای بررسی دستی (نه انقضای بی‌صدا)", async () => {
    const { w, st } = setup({ verify: { kind: "NOT_PAID", code: "x" }, inquire: { kind: "UNKNOWN", code: "?" }, calls: [] });
    const { attId } = w.seed({ createdAgoMin: 25 * 60 });
    expect((await st.settle(attId, "reconcile", null, w.now)).state).toBe("REVIEW");
    expect(w.att(attId).status).toBe("MISMATCH");
  });

  it("درگاه می‌گوید پرداخت شده ولی verify «نشده» گفت ⇒ یک بار دیگر verify", async () => {
    const outcomes: VerifyOutcome[] = [{ kind: "NOT_PAID", code: "-51" }, PAID()];
    const calls: string[] = [];
    const gw: PaymentGateway = { ...scripted({ calls }), async verify() { calls.push("verify"); return outcomes.shift()!; }, async inquire() { calls.push("inquire"); return { kind: "PAID_UNVERIFIED" }; } };
    const w = new World();
    const cfg = loadPaymentConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv);
    const st = new PaymentSettlement(w.prisma as any, w.audit as any, w.outbox as any, w.appts as any, new GatewayRegistry([gw], { primary: "zarinpal", fallbacks: [], breaker: new CircuitBreaker(3, 1000), isProduction: false }), cfg);
    const { attId, payId } = w.seed();
    expect((await st.settle(attId, "reconcile", null, w.now)).state).toBe("PAID");
    expect(calls).toEqual(["verify", "inquire", "verify"]);
    expect(w.pay(payId).status).toBe("PAID");
  });
});

describe("تسویه — حالت‌های لبه‌ی پول", () => {
  it("پرداخت پس از انقضای نوبت ⇒ بازپرداخت کامل خودکار، نوبت تأیید نمی‌شود", async () => {
    const { w, st } = setup({ verify: PAID(), calls: [] });
    const { apptId, payId, attId } = w.seed({ apptStatus: "EXPIRED" });
    const r = await st.settle(attId, "reconcile", null, w.now);
    expect(r.state).toBe("PAID");
    expect(w.applyCalls).toHaveLength(0);
    expect(w.appointments.get(apptId)!.status).toBe("EXPIRED");
    expect(w.pay(payId).status).toBe("REFUNDED");
    expect(w.refunds.rows).toEqual([{ paymentId: payId, amountRial: 1_000_000n, reason: "PAID_AFTER_EXPIRY" }]);
    expect(w.audits).toContain("payment.late_paid_refund");
    expect(w.pay(payId).appointmentSyncedAt).toEqual(w.now);
  });

  it("نوبت وسط کار منقضی شد (apply → Conflict) ⇒ به مسیر بازپرداخت می‌رود", async () => {
    const { w, st } = setup({ verify: PAID(), calls: [] });
    w.expireOnApply = true;
    const { payId, attId } = w.seed();
    await st.settle(attId, "callback", "patient-1", w.now);
    expect(w.pay(payId).status).toBe("REFUNDED");
    expect(w.refunds.rows).toHaveLength(1);
  });

  it("پرداخت تکراریِ همان نوبت ⇒ Payment همان می‌ماند، مبلغ دوم بازپرداخت می‌شود", async () => {
    const { w, st } = setup({ verify: PAID(), calls: [] });
    const { payId, attId } = w.seed({ payStatus: "PAID" });
    const r = await st.settle(attId, "reconcile", null, w.now);
    expect(r).toEqual({ state: "PAID", code: "duplicate" });
    expect(w.pay(payId).status).toBe("PAID");
    expect(w.refunds.rows[0]).toMatchObject({ reason: "DUPLICATE_PAYMENT", amountRial: 1_000_000n });
    expect(w.audits).toContain("payment.duplicate_paid");
  });

  it("ترمیم: PAID بدون هماهنگی نوبت (پروسه وسط کار مُرده) ⇒ تسویه‌ی دوباره نوبت را تأیید می‌کند", async () => {
    const { w, st } = setup({ verify: PAID(), calls: [] });
    const { apptId, payId, attId } = w.seed({ attemptStatus: "VERIFIED", payStatus: "PAID" });
    w.pay(payId).paidAt = new Date(w.now.getTime() - 600_000);
    const r = await st.settle(attId, "reconcile", null, w.now);
    expect(r.state).toBe("PAID");
    expect(w.appointments.get(apptId)!.status).toBe("PENDING_CONFIRMATION");
    expect(w.pay(payId).appointmentSyncedAt).toEqual(w.now);
  });

  it("attempt ی SANDBOX در production هرگز verify نمی‌شود", async () => {
    const calls: string[] = [];
    const w = new World();
    const cfg = loadPaymentConfig({ NODE_ENV: "production", PAYMENT_GATEWAY: "zarinpal", ZARINPAL_MERCHANT_ID: MID, ALLOWED_CALLBACK_ORIGINS: "https://example.ir", WEB_ORIGIN: "https://example.ir" } as NodeJS.ProcessEnv);
    const registry = new GatewayRegistry([scripted({ verify: PAID(), calls })], { primary: "zarinpal", fallbacks: [], breaker: new CircuitBreaker(3, 1000), isProduction: true });
    const st = new PaymentSettlement(w.prisma as any, w.audit as any, w.outbox as any, w.appts as any, registry, cfg);
    const { payId, attId } = w.seed({ gateway: "SANDBOX" });
    const r = await st.settle(attId, "callback", null, w.now);
    expect(r).toEqual({ state: "FAILED", code: "sandbox_in_production" });
    expect(calls).toEqual([]);
    expect(w.pay(payId).status).toBe("FAILED");
  });

  it("درگاهِ پیکربندی‌نشده ⇒ PENDING (چیزی تغییر نمی‌کند)", async () => {
    const { w, st } = setup({ verify: PAID(), calls: [] });
    const { attId } = w.seed({ gateway: "IDPAY" });
    expect((await st.settle(attId, "reconcile", null, w.now)).code).toBe("gateway_not_configured");
    expect(w.att(attId).status).toBe("INITIATED");
  });
});

describe("PaymentReconciler — job بازبینی", () => {
  it("فقط INITIATED های قدیمی‌تر از ۱۵ دقیقه را استعلام می‌کند و پرداخت‌شده‌ها را نهایی می‌کند", async () => {
    const calls: string[] = [];
    const { w, rec } = setup({ verify: PAID(), calls });
    const old = w.seed({ createdAgoMin: 20 });
    const fresh = w.seed({ createdAgoMin: 5 });
    const s = await rec.run(w.now);
    expect(s.checked).toBe(1);
    expect(s.paid).toBe(1);
    expect(w.att(old.attId).status).toBe("VERIFIED");
    expect(w.att(fresh.attId).status).toBe("INITIATED");
    expect(w.pay(old.payId).status).toBe("PAID");
  });

  it("claim: دو اجرای هم‌زمان یک تلاش را دوبار استعلام نمی‌کنند", async () => {
    const calls: string[] = [];
    const { w, rec } = setup({ verify: { kind: "NOT_PAID", code: "x" }, inquire: { kind: "PENDING" }, calls });
    w.seed({ createdAgoMin: 30 });
    const [a, b] = await Promise.all([rec.run(w.now), rec.run(w.now)]);
    expect(a.checked + b.checked).toBe(1);
    expect(calls.filter((c) => c === "verify")).toHaveLength(1);
  });

  it("تلاشی که به‌تازگی بررسی شده تا چند دقیقه دوباره بررسی نمی‌شود", async () => {
    const { w, rec } = setup({ verify: { kind: "NOT_PAID", code: "x" }, inquire: { kind: "PENDING" }, calls: [] });
    w.seed({ createdAgoMin: 30 });
    expect((await rec.run(w.now)).checked).toBe(1);
    expect((await rec.run(new Date(w.now.getTime() + 60_000))).checked).toBe(0);
    expect((await rec.run(new Date(w.now.getTime() + 5 * 60_000))).checked).toBe(1);
  });

  it("ترمیم: Payment ی PAID با نوبتِ هماهنگ‌نشده (قدیمی‌تر از ۲ دقیقه) را هماهنگ می‌کند", async () => {
    const { w, rec } = setup({ verify: PAID(), calls: [] });
    const { apptId, payId } = w.seed({ attemptStatus: "VERIFIED", payStatus: "PAID", createdAgoMin: 1 });
    w.pay(payId).paidAt = new Date(w.now.getTime() - 5 * 60_000);
    const s = await rec.run(w.now);
    expect(s.healed).toBe(1);
    expect(w.appointments.get(apptId)!.status).toBe("PENDING_CONFIRMATION");
    // PAID ی تازه (کمتر از ۲ دقیقه) دست نمی‌خورد: شاید پروسه‌ی اصلی هنوز در حال کار است
    const f = w.seed({ attemptStatus: "VERIFIED", payStatus: "PAID" });
    w.pay(f.payId).paidAt = new Date(w.now.getTime() - 30_000);
    expect((await rec.run(w.now)).healed).toBe(0);
  });

  it("خطای یک تلاش، بقیه را متوقف نمی‌کند", async () => {
    let n = 0;
    const gw: PaymentGateway = { ...scripted({ calls: [] }), async verify() { if (n++ === 0) throw new Error("boom"); return PAID(); } };
    const w = new World();
    const cfg = loadPaymentConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv);
    const st = new PaymentSettlement(w.prisma as any, w.audit as any, w.outbox as any, w.appts as any, new GatewayRegistry([gw], { primary: "zarinpal", fallbacks: [], breaker: new CircuitBreaker(3, 1000), isProduction: false }), cfg);
    const rec = new PaymentReconciler(w.prisma as any, st, cfg);
    w.seed({ createdAgoMin: 40 });
    const second = w.seed({ createdAgoMin: 30 });
    const s = await rec.run(w.now);
    expect(s.checked).toBe(2);
    expect(w.att(second.attId).status).toBe("VERIFIED");
  });
});
