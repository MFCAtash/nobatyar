import { describe, expect, it } from "vitest";
import {
  afterNotPaid, aggregateUnpaidStatus, ATTEMPT_REUSE_MIN, attemptsToInquire, checkPaid, extendedHold,
  fromDbGateway, isReusable, planAppointmentSync, reconcileCutoffs, toDbGateway,
} from "./payment-policy";

const paid = (over: { amountRial?: bigint } = {}) => ({ kind: "PAID" as const, refId: "1", alreadyVerified: false, ...over });
const H = 3_600_000;

describe("checkPaid", () => {
  it("مبلغ برابر ⇒ ok (با یا بدون مبلغ درگاه)", () => {
    expect(checkPaid(paid(), 100n, 100n)).toEqual({ ok: true });
    expect(checkPaid(paid({ amountRial: 100n }), 100n, 100n)).toEqual({ ok: true });
  });
  it("مبلغ درگاه کمتر/بیشتر ⇒ رد", () => {
    expect(checkPaid(paid({ amountRial: 99n }), 100n, 100n)).toEqual({ ok: false, code: "gateway_amount_mismatch" });
    expect(checkPaid(paid({ amountRial: 101n }), 100n, 100n)).toEqual({ ok: false, code: "gateway_amount_mismatch" });
  });
  it("مبلغ تلاش با مبلغ Payment فرق دارد ⇒ رد", () => {
    expect(checkPaid(paid(), 100n, 200n)).toEqual({ ok: false, code: "attempt_amount_differs_from_payment" });
  });
});

describe("afterNotPaid — فقط استعلام درگاه تصمیم می‌گیرد", () => {
  const young = 5 * 60_000;
  const old = 30 * H;
  const giveUp = 24 * H;
  it("درگاه می‌گوید پرداخت شده ⇒ دوباره verify", () => {
    expect(afterNotPaid({ kind: "PAID_UNVERIFIED" }, young, giveUp)).toBe("RETRY_VERIFY");
    expect(afterNotPaid({ kind: "VERIFIED" }, young, giveUp)).toBe("RETRY_VERIFY");
  });
  it("در بانک (PENDING) ⇒ صبر؛ پس از مهلت ⇒ EXPIRE", () => {
    expect(afterNotPaid({ kind: "PENDING" }, young, giveUp)).toBe("WAIT");
    expect(afterNotPaid({ kind: "PENDING" }, old, giveUp)).toBe("EXPIRE");
  });
  it("FAILED صریح ⇒ FAIL (حتی اگر تازه باشد)", () => {
    expect(afterNotPaid({ kind: "FAILED", code: "x" }, young, giveUp)).toBe("FAIL");
  });
  it("نامعلوم یا خطای استعلام ⇒ صبر؛ پس از مهلت ⇒ REVIEW (هرگز بی‌صدا منقضی نمی‌شود)", () => {
    expect(afterNotPaid({ kind: "UNKNOWN", code: "?" }, young, giveUp)).toBe("WAIT");
    expect(afterNotPaid(null, young, giveUp)).toBe("WAIT");
    expect(afterNotPaid({ kind: "UNKNOWN", code: "?" }, old, giveUp)).toBe("REVIEW");
    expect(afterNotPaid(null, old, giveUp)).toBe("REVIEW");
  });
});

describe("aggregateUnpaidStatus", () => {
  it("اگر تلاشی زنده یا در انتظار بررسی باشد ⇒ INITIATED", () => {
    expect(aggregateUnpaidStatus([{ status: "FAILED" }, { status: "INITIATED" }])).toBe("INITIATED");
    expect(aggregateUnpaidStatus([{ status: "MISMATCH" }])).toBe("INITIATED");
  });
  it("همه ناموفق/منقضی ⇒ FAILED", () => {
    expect(aggregateUnpaidStatus([{ status: "FAILED" }, { status: "EXPIRED" }])).toBe("FAILED");
    expect(aggregateUnpaidStatus([])).toBe("FAILED");
  });
});

describe("بازاستفاده از تلاش‌ها", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  const at = (minAgo: number) => new Date(now.getTime() - minAgo * 60_000);
  const mk = (id: string, minAgo: number, status: "INITIATED" | "FAILED" = "INITIATED", payUrl: string | null = "https://p/x") =>
    ({ id, status, createdAt: at(minAgo), payUrl });

  it("استعلام: فقط INITIATED، تازه‌ترین اول، حداکثر ۳", () => {
    const list = [mk("a", 50), mk("b", 5), mk("c", 20), mk("d", 1), mk("e", 2, "FAILED")];
    expect(attemptsToInquire(list).map((x) => x.id)).toEqual(["d", "b", "c"]);
  });
  it("قابل‌استفاده‌ی مجدد: تازه و دارای لینک", () => {
    expect(isReusable(mk("a", ATTEMPT_REUSE_MIN - 1), now)).toBe(true);
    expect(isReusable(mk("a", ATTEMPT_REUSE_MIN), now)).toBe(false);
    expect(isReusable(mk("a", 1, "INITIATED", null), now)).toBe(false);
    expect(isReusable(mk("a", 1, "FAILED"), now)).toBe(false);
  });
});

describe("planAppointmentSync", () => {
  it("PENDING_PAYMENT ⇒ تأیید", () => expect(planAppointmentSync("PENDING_PAYMENT")).toEqual({ action: "CONFIRM" }));
  it("نوبتِ جلوتر رفته ⇒ فقط علامت", () => {
    for (const s of ["PENDING_CONFIRMATION", "CONFIRMED", "IN_PROGRESS", "COMPLETED"]) expect(planAppointmentSync(s)).toEqual({ action: "MARK_SYNCED" });
  });
  it("منقضی/لغو/غیبت ⇒ بازپرداخت کامل", () => {
    for (const s of ["EXPIRED", "CANCELLED_BY_PATIENT", "CANCELLED_BY_DOCTOR", "NO_SHOW_PATIENT", "NO_SHOW_DOCTOR"]) expect(planAppointmentSync(s)).toEqual({ action: "REFUND" });
  });
});

describe("extendedHold / reconcileCutoffs / نگاشت DB", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  it("تمدید فقط بلندتر می‌کند", () => {
    expect(extendedHold(null, now, 30).toISOString()).toBe("2026-01-01T12:30:00.000Z");
    expect(extendedHold(new Date("2026-01-01T12:10:00Z"), now, 30).toISOString()).toBe("2026-01-01T12:30:00.000Z");
    expect(extendedHold(new Date("2026-01-01T13:00:00Z"), now, 30).toISOString()).toBe("2026-01-01T13:00:00.000Z");
  });
  it("برش‌های job", () => {
    const c = reconcileCutoffs(now, 15, 4);
    expect(c.createdBefore.toISOString()).toBe("2026-01-01T11:45:00.000Z");
    expect(c.checkedBefore.toISOString()).toBe("2026-01-01T11:56:00.000Z");
  });
  it("نگاشت نام درگاه", () => {
    expect(toDbGateway("zarinpal")).toBe("ZARINPAL");
    expect(toDbGateway("sandbox")).toBe("SANDBOX");
    expect(fromDbGateway("IDPAY")).toBe("idpay");
  });
});
