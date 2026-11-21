import { describe, expect, it } from "vitest";
import {
  APPOINTMENT_STATUSES,
  APPOINTMENT_TRANSITIONS,
  SLOT_HOLDING_STATUSES,
  canTransition,
} from "./appointment";

describe("appointment state machine", () => {
  it("every status has a transition entry", () => {
    for (const s of APPOINTMENT_STATUSES) expect(APPOINTMENT_TRANSITIONS[s]).toBeDefined();
  });

  it("terminal states have no outgoing transitions", () => {
    for (const s of ["COMPLETED", "CANCELLED_BY_PATIENT", "CANCELLED_BY_DOCTOR", "EXPIRED"] as const) {
      expect(APPOINTMENT_TRANSITIONS[s]).toHaveLength(0);
    }
  });

  it("allows and blocks expected transitions", () => {
    expect(canTransition("CONFIRMED", "IN_PROGRESS")).toBe(true);
    expect(canTransition("COMPLETED", "CONFIRMED")).toBe(false);
    expect(canTransition("CANCELLED_BY_PATIENT", "CONFIRMED")).toBe(false);
  });

  it("slot-holding statuses are never terminal", () => {
    for (const s of SLOT_HOLDING_STATUSES) expect(APPOINTMENT_TRANSITIONS[s].length).toBeGreaterThan(0);
  });
});
