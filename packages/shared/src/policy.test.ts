import { describe, expect, it } from "vitest";
import {
  APPOINTMENT_POLICY, assertPolicyInvariants, evaluateTransition, simulateRefund, toMermaid,
  type PolicyTimingConfig,
} from "./policy";

const cfg: PolicyTimingConfig = {
  startEarlyMinutes: 10,
  patientNoShowGraceMinutes: 10,
  doctorNoShowReportMinutes: 15,
  refundFullHours: 24,
  refundNoneHours: 2,
  refundMidPercent: 50,
};

const now = new Date("2026-01-01T10:00:00.000Z");
const startsAt = new Date("2026-01-01T12:00:00.000Z");
const endsAt = new Date("2026-01-01T12:20:00.000Z");
const facts = { status: "PENDING_CONFIRMATION" as const, startsAt, endsAt, autoConfirm: false };

describe("رجیستری قواعد ماشین وضعیت", () => {
  it("همهٔ قواعد از نظر ساختاری معتبراند", () => {
    expect(assertPolicyInvariants(APPOINTMENT_POLICY)).toEqual([]);
  });

  it("انتقال معتبر و نامعتبر را تشخیص میدهد", () => {
    expect(evaluateTransition(APPOINTMENT_POLICY, "CONFIRM", facts, now, cfg)).toMatchObject({ ok: true, to: "CONFIRMED" });
    expect(evaluateTransition(APPOINTMENT_POLICY, "START", facts, now, cfg)).toMatchObject({ ok: false, error: "invalid_state" });
  });

  it("پرداخت با autoConfirm مقصد را تغییر میدهد", () => {
    const paid = { ...facts, status: "PENDING_PAYMENT" as const };
    expect(evaluateTransition(APPOINTMENT_POLICY, "PAYMENT_SUCCEEDED", paid, now, cfg)).toMatchObject({ to: "PENDING_CONFIRMATION" });
    expect(evaluateTransition(APPOINTMENT_POLICY, "PAYMENT_SUCCEEDED", { ...paid, autoConfirm: true }, now, cfg)).toMatchObject({ to: "CONFIRMED" });
  });

  it("بازپرداخت طبق جدول است", () => {
    expect(simulateRefund("DOCTOR_CANCEL", 1_000_000n, startsAt, now, cfg).percent).toBe(100);
    expect(simulateRefund("PATIENT_CANCEL", 1_000_000n, startsAt, new Date("2025-12-31T10:00:00Z"), cfg).percent).toBe(100);
    expect(simulateRefund("PATIENT_CANCEL", 1_000_000n, startsAt, new Date("2026-01-01T09:00:00Z"), cfg).percent).toBe(50);
    expect(simulateRefund("PATIENT_CANCEL", 1_000_000n, startsAt, new Date("2026-01-01T11:30:00Z"), cfg).percent).toBe(0);
  });

  it("نمودار Mermaid همهٔ وضعیتها و اقدامها را دارد", () => {
    const m = toMermaid(APPOINTMENT_POLICY);
    expect(m).toContain("stateDiagram-v2");
    expect(m).toContain("PENDING_PAYMENT");
    expect(m).toContain("CONFIRM (doctor)");
  });
});
