import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROOM_POLICY,
  canRecord,
  joinGate,
  normalizePolicy,
  recordingConsentHash,
  retentionDeadline,
} from "./room-policy";

describe("M8 room policy", () => {
  it("is fail-closed: recording and screen share are off by default", () => {
    const p = normalizePolicy(null);
    expect(p.recordConsent).toBe(false);
    expect(p.allowScreenShare).toBe(false);
    expect(p.waitingRoom).toBe(true);
    expect(p.retentionHours).toBe(24);
  });

  it("clamps retention and treats junk as null", () => {
    expect(normalizePolicy({ retentionHours: 0 }).retentionHours).toBe(1);
    expect(normalizePolicy({ retentionHours: 9999 }).retentionHours).toBe(720);
    expect(normalizePolicy({ retentionHours: null }).retentionHours).toBeNull();
    expect(normalizePolicy({ retentionHours: Number.NaN }).retentionHours).toBeNull();
  });

  it("requires dual consent to record", () => {
    expect(canRecord({ ...DEFAULT_ROOM_POLICY, recordConsent: true }, { patient: true, doctor: false })).toBe(false);
    expect(canRecord({ ...DEFAULT_ROOM_POLICY, recordConsent: false }, { patient: true, doctor: true })).toBe(false);
    expect(canRecord({ ...DEFAULT_ROOM_POLICY, recordConsent: true }, { patient: true, doctor: true })).toBe(true);
  });

  it("keeps patients in the waiting room until admitted", () => {
    expect(joinGate(DEFAULT_ROOM_POLICY, "patient", false)).toBe("wait");
    expect(joinGate(DEFAULT_ROOM_POLICY, "patient", true)).toBe("allow");
    expect(joinGate(DEFAULT_ROOM_POLICY, "doctor", false)).toBe("allow");
    expect(joinGate({ ...DEFAULT_ROOM_POLICY, waitingRoom: false }, "patient", false)).toBe("allow");
  });

  it("computes retention deadline", () => {
    const start = new Date("2026-01-01T10:00:00Z");
    expect(retentionDeadline(start, { ...DEFAULT_ROOM_POLICY, retentionHours: 24 })?.toISOString())
      .toBe("2026-01-02T10:00:00.000Z");
    expect(retentionDeadline(start, { ...DEFAULT_ROOM_POLICY, retentionHours: null })).toBeNull();
  });

  it("derives a stable, scoped consent hash", () => {
    const h1 = recordingConsentHash("a", "u");
    expect(h1).toBe(recordingConsentHash("a", "u"));
    expect(h1).not.toBe(recordingConsentHash("a", "v"));
  });
});
