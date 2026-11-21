import { describe, expect, it } from "vitest";
import { APPOINTMENT_POLICY, evaluateTransition, type AppointmentAction, type PolicyFacts } from "@nobatyar/shared";
import { planAction, type Action, type AppointmentFacts } from "./actions";
import { loadSchedulingConfig } from "./config";

const cfg = loadSchedulingConfig({});
const policy = APPOINTMENT_POLICY;

const statusList = [
  "PENDING_PAYMENT", "PENDING_CONFIRMATION", "CONFIRMED", "IN_PROGRESS", "COMPLETED",
  "CANCELLED_BY_PATIENT", "CANCELLED_BY_DOCTOR", "EXPIRED", "NO_SHOW_PATIENT", "NO_SHOW_DOCTOR",
] as const;
const actionList = [
  "CONFIRM", "DOCTOR_CANCEL", "PATIENT_CANCEL", "START", "COMPLETE",
  "REPORT_PATIENT_NO_SHOW", "REPORT_DOCTOR_NO_SHOW", "EXPIRE", "PAYMENT_SUCCEEDED",
] as const;

describe("همخوانی policy registry با ماشین وضعیت API", () => {
  it("برای همهٔ ترکیبها نتیجهٔ شبیهساز همان planAction است", () => {
    const startsAt = new Date("2026-01-01T12:00:00Z");
    const endsAt = new Date("2026-01-01T12:20:00Z");
    const times = [
      new Date("2026-01-01T09:00:00Z"),
      new Date("2026-01-01T11:55:00Z"),
      new Date("2026-01-01T12:05:00Z"),
      new Date("2026-01-01T12:30:00Z"),
    ];

    for (const status of statusList) {
      for (const action of actionList) {
        for (const autoConfirm of [false, true]) {
          for (const now of times) {
            const apiFacts: AppointmentFacts = { status, startsAt, endsAt, autoConfirm };
            const sharedFacts: PolicyFacts = { status, startsAt, endsAt, autoConfirm };
            const a = planAction(action as Action, apiFacts, now, cfg);
            const b = evaluateTransition(policy, action as AppointmentAction, sharedFacts, now, cfg);
            expect(b.ok).toBe(a.ok);
            if (a.ok && b.ok) expect(b.to).toBe(a.to);
            if (!a.ok && !b.ok) expect(b.error).toBe(a.error);
          }
        }
      }
    }
  });
});
