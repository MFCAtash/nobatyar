/* eslint-disable @typescript-eslint/no-explicit-any */
import { RecordingOutbox } from "../outbox/outbox.service";
import { describe, expect, it } from "vitest";
import type { RefundOutcome } from "./gateway/gateway";
import { RefundService } from "./refund.service";

const maker = { id: "admin-A", role: "ADMIN" } as any;
const checker = { id: "admin-B", role: "ADMIN" } as any;
const on = { enabled: true, minAmountRial: 0n };

const matches = (row: any, where: any): boolean =>
  Object.entries(where).every(([k, v]: [string, any]) => {
    if (v && typeof v === "object" && "in" in v) return v.in.includes(row[k]);
    if (v && typeof v === "object" && "lt" in v) return row[k] instanceof Date && row[k] < v.lt;
    return row[k] === v;
  });

function world(o: { amount?: bigint; cfg?: typeof on; gw?: () => Promise<RefundOutcome>; status?: string } = {}) {
  const refunds: any[] = [{
    id: "r1", status: o.status ?? "PENDING", amountRial: o.amount ?? 500_000n, reason: "CANCELLED_BY_PATIENT", gateway: null, externalRef: null, tryCount: 0,
    lastErrorCode: null, createdAt: new Date("2026-03-01"), processedAt: null, note: null, paymentId: "p1", attemptId: null, claimedAt: null,
    approvalState: "NONE", approvalAction: null, approvalRef: null, makerId: null, makerNote: null, requestedAt: null, checkerId: null, checkerNote: null, decidedAt: null,
  }];
  const attempts = [{ id: "att1", gateway: "ZARINPAL", authority: "A00000000000000000000000000000123456", status: "VERIFIED" }];
  const audits: { action: string; meta?: any }[] = [];
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
  const audit = { logIn: async (_t: any, e: any) => void audits.push({ action: e.action, meta: e.meta }) };
  const outbox = new RecordingOutbox();
  let gwCalls = 0;
  const gw = { refund: async () => { gwCalls++; return (o.gw ?? (async () => ({ kind: "ACCEPTED", externalRef: "RF-1", gatewayStatus: "PENDING" } as RefundOutcome)))(); } };
  const svc = new RefundService(prisma as any, audit as any, outbox as any, { get: () => gw } as any, o.cfg ?? on);
  return { svc, refunds, audits, outbox, gwCalls: () => gwCalls };
}

describe("Maker/Checker — execute", () => {
  it("بدون تأیید: اجرا رد می‌شود و درگاه صدا زده نمی‌شود", async () => {
    const w = world();
    await expect(w.svc.execute(maker, "r1")).rejects.toMatchObject({ response: { error: "approval_required" } });
    expect(w.gwCalls()).toBe(0);
    expect(w.refunds[0].status).toBe("PENDING");
  });

  it("چرخه‌ی کامل: درخواست (A) ⇒ تأیید (B) ⇒ اجرا ⇒ تأیید مصرف می‌شود", async () => {
    const w = world();
    const req = await w.svc.requestApproval(maker, "r1", { action: "EXECUTE", note: "تماس بیمار" });
    expect(req.approval).toMatchObject({ state: "REQUESTED", action: "EXECUTE", makerId: "admin-A" });
    await expect(w.svc.execute(maker, "r1")).rejects.toMatchObject({ response: { error: "approval_required" } }); // هنوز تأیید نشده
    const ok = await w.svc.decideApproval(checker, "r1", { decision: "APPROVE" });
    expect(ok.approval).toMatchObject({ state: "APPROVED", checkerId: "admin-B" });

    const done = await w.svc.execute(maker, "r1");
    expect(done.status).toBe("PROCESSED");
    expect(w.gwCalls()).toBe(1);
    expect(w.refunds[0].approvalState).toBe("NONE"); // یک‌بارمصرف
    expect(w.audits.map((a) => a.action)).toEqual(["refund.approval_requested", "refund.approval_approved", "refund.execute_started", "refund.processed"]);
    expect(w.audits[2].meta).toEqual({ makerId: "admin-A", checkerId: "admin-B" });
    expect(w.outbox.types).toEqual(["refund.processed"]); // اعلان در همان تراکنش ثبت شد
  });

  it("Maker نمی‌تواند درخواست خودش را تأیید کند", async () => {
    const w = world();
    await w.svc.requestApproval(maker, "r1", { action: "EXECUTE" });
    await expect(w.svc.decideApproval(maker, "r1", { decision: "APPROVE" })).rejects.toMatchObject({ response: { error: "self_approval_forbidden" }, status: 403 });
    expect(w.refunds[0].approvalState).toBe("REQUESTED");
  });

  it("رد ⇒ اجرا ممکن نیست؛ Maker می‌تواند دوباره درخواست دهد", async () => {
    const w = world();
    await w.svc.requestApproval(maker, "r1", { action: "EXECUTE" });
    await w.svc.decideApproval(checker, "r1", { decision: "REJECT", note: "مبلغ نادرست" });
    await expect(w.svc.execute(maker, "r1")).rejects.toMatchObject({ response: { error: "approval_required" } });
    const again = await w.svc.requestApproval(maker, "r1", { action: "EXECUTE" });
    expect(again.approval.state).toBe("REQUESTED");
  });

  it("تأیید یک‌بارمصرف است: پس از ردِ درگاه (FAILED) تلاش بعدی تأیید تازه می‌خواهد", async () => {
    const w = world({ gw: async () => ({ kind: "REJECTED", code: "gateway_rejected" } as RefundOutcome) });
    await w.svc.requestApproval(maker, "r1", { action: "EXECUTE" });
    await w.svc.decideApproval(checker, "r1", { decision: "APPROVE" });
    const first = await w.svc.execute(maker, "r1");
    expect(first.status).toBe("FAILED");
    await expect(w.svc.execute(maker, "r1")).rejects.toMatchObject({ response: { error: "approval_required" } });
    expect(w.gwCalls()).toBe(1);
  });

  it("دو اجرای هم‌زمان با یک تأیید ⇒ فقط یکی به درگاه می‌رود", async () => {
    const w = world({ gw: async () => { await new Promise((r) => setTimeout(r, 15)); return { kind: "ACCEPTED", externalRef: "X", gatewayStatus: "PENDING" } as RefundOutcome; } });
    await w.svc.requestApproval(maker, "r1", { action: "EXECUTE" });
    await w.svc.decideApproval(checker, "r1", { decision: "APPROVE" });
    const r = await Promise.allSettled([w.svc.execute(maker, "r1"), w.svc.execute(checker, "r1")]);
    expect(w.gwCalls()).toBe(1);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });

  it("تأیید EXECUTE برای mark-processed معتبر نیست", async () => {
    const w = world();
    await w.svc.requestApproval(maker, "r1", { action: "EXECUTE" });
    await w.svc.decideApproval(checker, "r1", { decision: "APPROVE" });
    await expect(w.svc.markProcessed(maker, "r1", { reference: "bank-ref-1" })).rejects.toMatchObject({ response: { error: "approval_action_mismatch" } });
  });
});

describe("Maker/Checker — mark-processed", () => {
  it("فقط با همان مرجعی که Checker تأیید کرده", async () => {
    const w = world();
    await expect(w.svc.requestApproval(maker, "r1", { action: "MARK_PROCESSED" })).rejects.toMatchObject({ response: { error: "reference_required" }, status: 400 });
    await w.svc.requestApproval(maker, "r1", { action: "MARK_PROCESSED", reference: "bank-ref-1" });
    await w.svc.decideApproval(checker, "r1", { decision: "APPROVE" });
    await expect(w.svc.markProcessed(maker, "r1", { reference: "OTHER-REF" })).rejects.toMatchObject({ response: { error: "approval_reference_mismatch" } });
    const v = await w.svc.markProcessed(maker, "r1", { reference: "bank-ref-1" });
    expect(v.status).toBe("PROCESSED");
    expect(v.externalRef).toBe("manual:bank-ref-1");
    expect(w.refunds[0].approvalState).toBe("NONE");
  });
});

describe("Maker/Checker — configuration", () => {
  it("غیرفعال ⇒ رفتار قدیمی (اجرای مستقیم)", async () => {
    const w = world({ cfg: { enabled: false, minAmountRial: 0n } });
    expect((await w.svc.execute(maker, "r1")).status).toBe("PROCESSED");
  });
  it("مبلغ زیر آستانه تأیید دوم نمی‌خواهد؛ بالای آستانه می‌خواهد", async () => {
    const cfg = { enabled: true, minAmountRial: 1_000_000n };
    expect((await world({ amount: 500_000n, cfg }).svc.execute(maker, "r1")).status).toBe("PROCESSED");
    await expect(world({ amount: 1_000_000n, cfg }).svc.execute(maker, "r1")).rejects.toMatchObject({ response: { error: "approval_required" } });
  });
  it("درخواست تأیید برای مبلغ زیر آستانه بی‌معنی است", async () => {
    await expect(world({ amount: 5n, cfg: { enabled: true, minAmountRial: 10n } }).svc.requestApproval(maker, "r1", { action: "EXECUTE" })).rejects.toMatchObject({ response: { error: "approval_not_required" } });
  });
  it("استرداد نهایی‌شده (PROCESSED) درخواست تأیید نمی‌پذیرد", async () => {
    await expect(world({ status: "PROCESSED" }).svc.requestApproval(maker, "r1", { action: "EXECUTE" })).rejects.toMatchObject({ response: { error: "not_in_expected_state" } });
  });
});
