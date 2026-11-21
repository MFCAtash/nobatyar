/* eslint-disable @typescript-eslint/no-explicit-any */
import { RecordingOutbox } from "../outbox/outbox.service";
import { describe, expect, it } from "vitest";
import { GatewayError } from "./gateway/gateway";
import type { RefundOutcome } from "./gateway/gateway";
import { ZarinpalGateway, sessionIdFromAuthority } from "./gateway/zarinpal.gateway";
import { RefundService } from "./refund.service";

const admin = { id: "admin-1", role: "ADMIN" } as any;
const matches = (row: any, where: any): boolean =>
  Object.entries(where).every(([k, v]: [string, any]) => {
    if (v && typeof v === "object" && "in" in v) return v.in.includes(row[k]);
    if (v && typeof v === "object" && "lt" in v) return row[k] instanceof Date && row[k] < v.lt;
    return row[k] === v;
  });

function world(gw?: { refund?: (i: any) => Promise<RefundOutcome> } | null, opts: { amount?: bigint; attemptId?: string | null } = {}) {
  const refunds: any[] = [{
    id: "r1", status: "PENDING", amountRial: opts.amount ?? 500_000n, reason: "CANCELLED_BY_PATIENT", gateway: null, externalRef: null, tryCount: 0,
    lastErrorCode: null, createdAt: new Date("2026-03-01"), processedAt: null, note: null, paymentId: "p1", attemptId: opts.attemptId ?? null, claimedAt: null,
  }];
  const attempts = [{ id: "att1", gateway: "ZARINPAL", authority: "A00000000000000000000000000000123456", status: "VERIFIED" }];
  const audits: string[] = [];
  const view = (r: any) => r && { ...r, payment: { appointmentId: "appt1", attempts, appointment: { patient: { fullName: "بیمار" } } } };
  const refund = {
    updateMany: async ({ where, data }: any) => {
      const hit = refunds.filter((r) => matches(r, where));
      for (const r of hit) for (const [k, v] of Object.entries<any>(data)) r[k] = v && typeof v === "object" && "increment" in v ? r[k] + v.increment : v;
      return { count: hit.length };
    },
    findUnique: async ({ where }: any) => view(refunds.find((r) => r.id === where.id)),
    findMany: async () => refunds.map(view),
  };
  const prisma = { withContext: async (_c: any, fn: any) => fn({ refund, appointment: { findUnique: async () => ({ patientId: "pat1" }) } }) };
  const audit = { logIn: async (_t: any, e: any) => void audits.push(e.action) };
  const outbox = new RecordingOutbox();
  const registry = { get: () => gw ?? undefined };
  const svc = new RefundService(prisma as any, audit as any, outbox as any, registry as any);
  return { svc, refunds, audits, get notes() { return outbox.types; } };
}

describe("RefundService.execute", () => {
  it("پذیرش درگاه ⇒ PROCESSED با مرجع، Audit و اعلان به بیمار", async () => {
    let seen: any;
    const w = world({ refund: async (i) => { seen = i; return { kind: "ACCEPTED", externalRef: "RF-9", gatewayStatus: "PENDING" }; } });
    const v = await w.svc.execute(admin, "r1");
    expect(v.status).toBe("PROCESSED");
    expect(v.externalRef).toBe("RF-9");
    expect(w.refunds[0].processedBy).toBe("admin-1");
    expect(w.audits).toEqual(["refund.execute_started", "refund.processed"]);
    expect(w.notes).toHaveLength(1);
    expect(seen.amountRial).toBe(500_000n);
    expect(seen.authority.startsWith("A")).toBe(true);
    expect(/دکتر|بیمار|سردرد/.test(seen.description)).toBe(false); // داده‌ی شخصی/سلامت به درگاه نمی‌رود
  });

  it("دو اجرای هم‌زمان ⇒ فقط یکی به درگاه می‌رود (claim اتمیک)", async () => {
    let calls = 0;
    const w = world({ refund: async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return { kind: "ACCEPTED", externalRef: "X", gatewayStatus: "PENDING" }; } });
    const [a, b] = await Promise.allSettled([w.svc.execute(admin, "r1"), w.svc.execute(admin, "r1")]);
    expect(calls).toBe(1);
    expect([a.status, b.status].sort()).toEqual(["fulfilled", "rejected"]);
  });

  it("رد قطعی درگاه ⇒ FAILED (پولی جابه‌جا نشده؛ قابل اجرای مجدد)", async () => {
    const w = world({ refund: async () => ({ kind: "REJECTED", code: "NOT_ENOUGH_BALANCE" }) });
    const v = await w.svc.execute(admin, "r1");
    expect(v.status).toBe("FAILED");
    expect(v.lastErrorCode).toBe("NOT_ENOUGH_BALANCE");
    w.refunds[0].status = "FAILED";
    expect((await world({ refund: async () => ({ kind: "ACCEPTED", externalRef: "R", gatewayStatus: "PENDING" }) }).svc.execute(admin, "r1")).status).toBe("PROCESSED");
  });

  it("پاسخ مبهم (timeout/۵xx) ⇒ REVIEW و اجرای مجدد خودکار ممنوع (خطر استرداد دوباره)", async () => {
    let calls = 0;
    const w = world({ refund: async () => { calls++; throw new GatewayError("zarinpal", "unavailable", "timeout"); } });
    const v = await w.svc.execute(admin, "r1");
    expect(v.status).toBe("REVIEW");
    await expect(w.svc.execute(admin, "r1")).rejects.toThrow(/refund_not_executable/);
    expect(calls).toBe(1);
  });

  it("درگاه بدون API / توکن ناموجود ⇒ MANUAL", async () => {
    expect((await world(null).svc.execute(admin, "r1")).status).toBe("MANUAL");
    expect((await world({}).svc.execute(admin, "r1")).status).toBe("MANUAL");
    expect((await world({ refund: async () => ({ kind: "UNSUPPORTED", reason: "below_minimum" }) }).svc.execute(admin, "r1")).lastErrorCode).toBe("below_minimum");
  });

  it("استرداد نهایی‌شده دوباره اجرا نمی‌شود؛ شناسه‌ی ناموجود ⇒ 404", async () => {
    const w = world({ refund: async () => ({ kind: "ACCEPTED", externalRef: "R", gatewayStatus: "PENDING" }) });
    await w.svc.execute(admin, "r1");
    await expect(w.svc.execute(admin, "r1")).rejects.toThrow(/refund_not_executable/);
    await expect(w.svc.execute(admin, "nope")).rejects.toThrow();
  });
});

describe("ثبت دستی و بررسی", () => {
  it("markProcessed از MANUAL/REVIEW/FAILED/PENDING؛ از PROCESSED نه", async () => {
    const w = world(null);
    await w.svc.execute(admin, "r1"); // ⇒ MANUAL
    const v = await w.svc.markProcessed(admin, "r1", { reference: "BANK-123", note: "از پنل" });
    expect(v.status).toBe("PROCESSED");
    expect(v.externalRef).toBe("manual:BANK-123");
    await expect(w.svc.markProcessed(admin, "r1", { reference: "BANK-999" })).rejects.toThrow(/refund_not_in_expected_state/);
  });

  it("markNotRefunded فقط از REVIEW و نتیجه FAILED است", async () => {
    const w = world({ refund: async () => { throw new GatewayError("zarinpal", "unavailable", "x"); } });
    await expect(w.svc.markNotRefunded(admin, "r1", { note: "بررسی شد" })).rejects.toThrow(/refund_not_in_expected_state/); // هنوز PENDING
    await w.svc.execute(admin, "r1");
    expect((await w.svc.markNotRefunded(admin, "r1", { note: "در پنل زرین‌پال ثبت نشده" })).status).toBe("FAILED");
  });

  it("PROCESSING ی قدیمی ⇒ REVIEW (sweepStale)", async () => {
    const w = world(null);
    w.refunds[0].status = "PROCESSING";
    w.refunds[0].claimedAt = new Date("2026-03-01T10:00:00Z");
    expect(await w.svc.sweepStale(new Date("2026-03-01T10:20:00Z"))).toBe(1);
    expect(w.refunds[0].status).toBe("REVIEW");
    w.refunds[0].status = "PROCESSING";
    w.refunds[0].claimedAt = new Date("2026-03-01T10:15:00Z");
    expect(await w.svc.sweepStale(new Date("2026-03-01T10:20:00Z"))).toBe(0);
  });
});

describe("ZarinpalGateway.refund (AddRefund، مستندات رسمی)", () => {
  const reply = (body: unknown, status = 200) => async () => ({ status, text: async () => JSON.stringify(body) });
  const mk = (fetchFn: any, cfg: any = {}) => new ZarinpalGateway({ merchantId: "m", sandbox: false, accessToken: "tok_" + "x".repeat(20), ...cfg }, { timeoutMs: 1000, fetchFn });
  const input = { authority: "A00000000000000000000000000000123456", orderId: "o", amountRial: 50_000n, description: "d" };

  it("session_id از authority؛ درخواست درست (Bearer، mutation، مبلغ)", async () => {
    expect(sessionIdFromAuthority("A00000000000000000000000000000123456")).toBe("123456");
    expect(sessionIdFromAuthority("SANDBOX-1")).toBeUndefined();
    let req: any;
    const gw = mk(async (url: string, init: any) => { req = { url, init, body: JSON.parse(init.body) }; return reply({ data: { resource: { id: "999", amount: 50000, timeline: { refund_status: "PENDING" } } } })(); });
    expect(await gw.refund(input)).toEqual({ kind: "ACCEPTED", externalRef: "999", gatewayStatus: "PENDING" });
    expect(req.init.headers.Authorization).toBe("Bearer tok_" + "x".repeat(20));
    expect(req.body.query).toContain("AddRefund");
    expect(req.body.variables).toEqual({ session_id: "123456", amount: "50000", description: "d", method: "PAYA", reason: "CUSTOMER_REQUEST" });
  });

  it("توکن ندارد / زیر حداقل ۲۰٬۰۰۰ ریال / authority نامفهوم ⇒ UNSUPPORTED (بدون تماس شبکه)", async () => {
    const never = async () => { throw new Error("network must not be called"); };
    expect(await mk(never, { accessToken: undefined }).refund(input)).toEqual({ kind: "UNSUPPORTED", reason: "not_configured" });
    expect(await mk(never).refund({ ...input, amountRial: 19_999n })).toEqual({ kind: "UNSUPPORTED", reason: "below_minimum" });
    expect(await mk(never).refund({ ...input, authority: "weird" })).toEqual({ kind: "UNSUPPORTED", reason: "unknown_session" });
  });

  it("خطای GraphQL ⇒ REJECTED؛ خطای داخلی/۵xx/پاسخ نامفهوم ⇒ مبهم (throw)", async () => {
    expect(await mk(reply({ errors: [{ message: "x", extensions: { code: "FORBIDDEN" } }] })).refund(input)).toEqual({ kind: "REJECTED", code: "FORBIDDEN" });
    await expect(mk(reply({ errors: [{ extensions: { code: "INTERNAL_SERVER_ERROR" } }] })).refund(input)).rejects.toThrow(GatewayError);
    await expect(mk(reply({}, 503)).refund(input)).rejects.toThrow(GatewayError);
    await expect(mk(reply({ data: { resource: null } })).refund(input)).rejects.toThrow(GatewayError);
    expect(await mk(reply({ data: { resource: { id: "1", timeline: { refund_status: "FAILED" } } } })).refund(input)).toEqual({ kind: "REJECTED", code: "refund_status_failed" });
  });
});
