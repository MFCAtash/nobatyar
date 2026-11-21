import { APPOINTMENT_STATUSES, canTransition } from "@nobatyar/shared";
import { describe, expect, it } from "vitest";
import { Action, ACTION_ACTOR, computeRefund, planAction, Status } from "./actions";
import { loadSchedulingConfig } from "./config";

const cfg = loadSchedulingConfig({});
const starts = new Date("2026-10-20T10:00:00Z");
const ends = new Date("2026-10-20T10:20:00Z");
const at = (mins: number) => new Date(starts.getTime() + mins * 60_000);
const f = (status: Status, autoConfirm = false) => ({ status, startsAt: starts, endsAt: ends, autoConfirm });

describe("planAction", () => {
  it("every successful plan is a legal transition in the shared state machine (exhaustive)", () => {
    const actions = Object.keys(ACTION_ACTOR) as Action[];
    const times = [-72, -3, -1, -0.2, 0, 0.1, 0.2, 0.4, 3].map((h) => new Date(starts.getTime() + h * 3_600_000));
    for (const status of APPOINTMENT_STATUSES)
      for (const action of actions)
        for (const now of times)
          for (const autoConfirm of [true, false]) {
            const p = planAction(action, f(status as Status, autoConfirm), now, cfg);
            if (p.ok) expect(canTransition(status, p.to), `${action}: ${status} → ${p.to}`).toBe(true);
          }
  });

  it("payment success honours doctor's autoConfirm", () => {
    expect(planAction("PAYMENT_SUCCEEDED", f("PENDING_PAYMENT", true), at(-600), cfg)).toEqual({ ok: true, to: "CONFIRMED" });
    expect(planAction("PAYMENT_SUCCEEDED", f("PENDING_PAYMENT", false), at(-600), cfg)).toEqual({ ok: true, to: "PENDING_CONFIRMATION" });
    expect(planAction("PAYMENT_SUCCEEDED", f("EXPIRED"), at(-600), cfg)).toEqual({ ok: false, error: "invalid_state" });
  });

  it("start window: not before 10 min early, not after the slot ends", () => {
    expect(planAction("START", f("CONFIRMED"), at(-30), cfg)).toEqual({ ok: false, error: "too_early" });
    expect(planAction("START", f("CONFIRMED"), at(-5), cfg)).toEqual({ ok: true, to: "IN_PROGRESS" });
    expect(planAction("START", f("CONFIRMED"), at(25), cfg)).toEqual({ ok: false, error: "too_late" });
  });

  it("cancel is impossible after start; confirm only from pending-confirmation", () => {
    expect(planAction("PATIENT_CANCEL", f("CONFIRMED"), at(1), cfg)).toEqual({ ok: false, error: "too_late" });
    expect(planAction("CONFIRM", f("CONFIRMED"), at(-60), cfg)).toEqual({ ok: false, error: "invalid_state" });
  });

  it("no-show reports respect grace periods", () => {
    expect(planAction("REPORT_PATIENT_NO_SHOW", f("CONFIRMED"), at(5), cfg)).toEqual({ ok: false, error: "too_early" });
    expect(planAction("REPORT_PATIENT_NO_SHOW", f("CONFIRMED"), at(11), cfg)).toEqual({ ok: true, to: "NO_SHOW_PATIENT" });
    expect(planAction("REPORT_DOCTOR_NO_SHOW", f("CONFIRMED"), at(10), cfg)).toEqual({ ok: false, error: "too_early" });
    expect(planAction("REPORT_DOCTOR_NO_SHOW", f("CONFIRMED"), at(16), cfg)).toEqual({ ok: true, to: "NO_SHOW_DOCTOR" });
  });
});

describe("computeRefund", () => {
  const paid = 3_000_000n;
  const r = (a: Action, hoursBefore: number) => computeRefund(a, paid, starts, new Date(starts.getTime() - hoursBefore * 3_600_000), cfg);

  it("patient cancellation tiers: ≥24h full, 2–24h partial, <2h none", () => {
    expect(r("PATIENT_CANCEL", 48)).toEqual({ percent: 100, amountRial: paid });
    expect(r("PATIENT_CANCEL", 24)).toEqual({ percent: 100, amountRial: paid });
    expect(r("PATIENT_CANCEL", 10)).toEqual({ percent: 50, amountRial: 1_500_000n });
    expect(r("PATIENT_CANCEL", 2)).toEqual({ percent: 50, amountRial: 1_500_000n });
    expect(r("PATIENT_CANCEL", 1)).toEqual({ percent: 0, amountRial: 0n });
  });
  it("doctor-side failures refund fully; patient no-show refunds nothing", () => {
    expect(r("DOCTOR_CANCEL", 0.1).amountRial).toBe(paid);
    expect(r("REPORT_DOCTOR_NO_SHOW", -1).amountRial).toBe(paid);
    expect(r("EXPIRE", 5).amountRial).toBe(paid);
    expect(r("REPORT_PATIENT_NO_SHOW", -1).amountRial).toBe(0n);
  });
  it("rounds down (never refunds more than owed)", () => {
    expect(computeRefund("PATIENT_CANCEL", 1_000_001n, starts, new Date(starts.getTime() - 10 * 3_600_000), cfg).amountRial).toBe(500_000n);
  });
});

describe("loadSchedulingConfig", () => {
  it("validates ranges", () => {
    expect(() => loadSchedulingConfig({ REFUND_NONE_HOURS: "30", REFUND_FULL_HOURS: "24" })).toThrow(/REFUND_NONE_HOURS/);
    expect(() => loadSchedulingConfig({ HOLD_MINUTES: "0" })).toThrow(/HOLD_MINUTES/);
  });
});
