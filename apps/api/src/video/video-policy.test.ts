import { describe, expect, it } from "vitest";
import { identityOf, joinWindow, planJoin, userIdOf } from "./video-policy";
import type { VisitFacts } from "./video-policy";

const cfg = { startEarlyMinutes: 10, joinGraceMinutes: 15 };
const DOC = "11111111-1111-4111-8111-111111111111";
const PAT = "22222222-2222-4222-8222-222222222222";
const ADM = "33333333-3333-4333-8333-333333333333";
const starts = new Date("2026-10-20T10:00:00Z");
const ends = new Date("2026-10-20T10:20:00Z");
const at = (mins: number) => new Date(starts.getTime() + mins * 60_000);
const visit = (o: Partial<VisitFacts> = {}): VisitFacts => ({
  status: "CONFIRMED", kind: "VIDEO", startsAt: starts, endsAt: ends, doctorId: DOC, patientId: PAT, ...o,
});

describe("planJoin", () => {
  it("both participants may join inside the window and get their role", () => {
    expect(planJoin(visit(), DOC, at(0), cfg)).toMatchObject({ ok: true, role: "doctor" });
    expect(planJoin(visit(), PAT, at(5), cfg)).toMatchObject({ ok: true, role: "patient" });
  });

  it("window opens startEarlyMinutes before start (inclusive) and closes joinGrace after end (exclusive)", () => {
    expect(planJoin(visit(), PAT, at(-10.01), cfg)).toMatchObject({ ok: false, error: "too_early" });
    expect(planJoin(visit(), PAT, at(-10), cfg).ok).toBe(true);
    expect(planJoin(visit(), PAT, new Date(ends.getTime() + 14.9 * 60_000), cfg).ok).toBe(true);
    expect(planJoin(visit(), PAT, new Date(ends.getTime() + 15 * 60_000), cfg)).toMatchObject({ ok: false, error: "too_late" });
  });

  it("too_early / too_late expose the window so the UI can show a countdown", () => {
    const early = planJoin(visit(), PAT, at(-60), cfg);
    expect(early.ok).toBe(false);
    expect(early.opensAt?.toISOString()).toBe("2026-10-20T09:50:00.000Z");
    expect(early.closesAt?.toISOString()).toBe("2026-10-20T10:35:00.000Z");
  });

  it("admins and strangers are not participants (no leak: same error for both)", () => {
    expect(planJoin(visit(), ADM, at(0), cfg)).toEqual({ ok: false, error: "not_participant" });
    expect(planJoin(visit(), "other", at(0), cfg)).toEqual({ ok: false, error: "not_participant" });
  });

  it("participant check wins over every other rule (no state/kind oracle for outsiders)", () => {
    expect(planJoin(visit({ status: "COMPLETED", kind: "CHAT" }), ADM, at(0), cfg)).toEqual({ ok: false, error: "not_participant" });
  });

  it("only VIDEO visits", () => {
    expect(planJoin(visit({ kind: "CHAT" }), PAT, at(0), cfg)).toEqual({ ok: false, error: "not_video_visit" });
    expect(planJoin(visit({ kind: "IN_PERSON" }), DOC, at(0), cfg)).toEqual({ ok: false, error: "not_video_visit" });
  });

  it("only CONFIRMED and IN_PROGRESS; every other status is invalid_state", () => {
    const ok = ["CONFIRMED", "IN_PROGRESS"];
    for (const s of [
      "PENDING_PAYMENT", "PENDING_CONFIRMATION", "CONFIRMED", "IN_PROGRESS", "COMPLETED",
      "CANCELLED_BY_PATIENT", "CANCELLED_BY_DOCTOR", "EXPIRED", "NO_SHOW_PATIENT", "NO_SHOW_DOCTOR",
    ] as const) {
      const r = planJoin(visit({ status: s }), PAT, at(0), cfg);
      if (ok.includes(s)) expect(r.ok).toBe(true);
      else expect(r).toEqual({ ok: false, error: "invalid_state" });
    }
  });

  it("an overrunning IN_PROGRESS visit can reconnect until the grace period ends", () => {
    expect(planJoin(visit({ status: "IN_PROGRESS" }), PAT, at(30), cfg).ok).toBe(true);
    expect(planJoin(visit({ status: "IN_PROGRESS" }), PAT, at(36), cfg)).toMatchObject({ ok: false, error: "too_late" });
  });

  it("joinWindow follows config", () => {
    const w = joinWindow(visit(), { startEarlyMinutes: 0, joinGraceMinutes: 0 });
    expect(w.opensAt.getTime()).toBe(starts.getTime());
    expect(w.closesAt.getTime()).toBe(ends.getTime());
  });
});

describe("identity", () => {
  it("round-trips and rejects foreign identities", () => {
    expect(identityOf(DOC)).toBe(`u_${DOC}`);
    expect(userIdOf(identityOf(DOC))).toBe(DOC);
    expect(userIdOf("egress-123")).toBeNull();
  });
});
