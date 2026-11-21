import { describe, expect, it } from "vitest";
import { refundRules, selectRefundRule, type RefundPolicyConfig } from "./refund-policy";
import { computeRefund } from "./actions";
import { loadSchedulingConfig } from "./config";

const cfg: RefundPolicyConfig = { refundFullHours: 24, refundNoneHours: 2, refundMidPercent: 50 };
const startsAt = new Date("2026-01-01T12:00:00Z");

describe("جدول قواعد بازپرداخت", () => {
  it("قواعد نامدار و بدون درصد جادوییاند", () => {
    const rules = refundRules(cfg);
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
    for (const r of rules) expect(r.percent).toBeGreaterThanOrEqual(0);
  });

  it("آستانهها را به درستی انتخاب میکند", () => {
    expect(selectRefundRule("PATIENT_CANCEL", 25, cfg).percent).toBe(100);
    expect(selectRefundRule("PATIENT_CANCEL", 3, cfg).percent).toBe(50);
    expect(selectRefundRule("PATIENT_CANCEL", 1, cfg).percent).toBe(0);
    expect(selectRefundRule("DOCTOR_CANCEL", 0, cfg).percent).toBe(100);
    expect(selectRefundRule("REPORT_PATIENT_NO_SHOW", 10, cfg).percent).toBe(0);
  });

  it("رفتار computeRefund تغییری نکرده است", () => {
    const full = loadSchedulingConfig({});
    expect(computeRefund("PATIENT_CANCEL", 1_000_000n, startsAt, new Date("2025-12-31T10:00:00Z"), full).percent).toBe(100);
    expect(computeRefund("PATIENT_CANCEL", 1_000_000n, startsAt, new Date("2026-01-01T09:00:00Z"), full).percent).toBe(50);
    expect(computeRefund("PATIENT_CANCEL", 1_000_000n, startsAt, new Date("2026-01-01T11:30:00Z"), full).percent).toBe(0);
  });
});
