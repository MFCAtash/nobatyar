import { describe, expect, it } from "vitest";
import { matchesFreedSlot } from "./waitlist-policy";

const now = new Date("2026-01-01T08:00:00Z");
const w = { id: "w", patientId: "p", kind: "VIDEO", desiredFrom: new Date("2026-01-01T00:00:00Z"), desiredTo: new Date("2026-01-03T00:00:00Z") };
const slot = { startsAt: new Date("2026-01-02T10:00:00Z"), endsAt: new Date("2026-01-02T10:20:00Z"), kind: "VIDEO" };

describe("matchesFreedSlot", () => {
  it("وقتی اسلات داخل بازه و همجنس باشد منطبق است", () => expect(matchesFreedSlot(w, slot, now)).toBe(true));
  it("نوع متفاوت رد میشود", () => expect(matchesFreedSlot(w, { ...slot, kind: "IN_PERSON" }, now)).toBe(false));
  it("اسلات خارج بازه رد میشود", () => expect(matchesFreedSlot({ ...w, desiredTo: new Date("2026-01-02T00:00:00Z") }, slot, now)).toBe(false));
  it("بازه منقضی رد میشود", () => expect(matchesFreedSlot({ ...w, desiredTo: new Date("2025-12-31T00:00:00Z") }, slot, now)).toBe(false));
});
