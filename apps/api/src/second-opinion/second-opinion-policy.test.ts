import { describe, expect, it } from "vitest";
import { DEFAULT_SO_CONFIG as cfg, planSoAction, planSoRequest, SO_ACTOR, SO_TERMINAL } from "./second-opinion-policy";
import type { RequestFacts, SoFacts, SoStatus } from "./second-opinion-policy";

const T0 = new Date("2026-10-20T10:00:00Z");
const at = (h: number) => new Date(T0.getTime() + h * 3_600_000);
const facts = (status: SoStatus, o: Partial<SoFacts> = {}): SoFacts => ({ status, acceptDeadlineAt: at(48), answerDeadlineAt: status === "ACCEPTED" ? at(72) : null, ...o });

describe("planSoAction", () => {
  it("پذیرش قبل از مهلت ⇒ ACCEPTED و مهلت پاسخ از لحظه‌ی پذیرش", () => {
    const p = planSoAction("ACCEPT", facts("REQUESTED"), at(10), cfg);
    expect(p).toMatchObject({ ok: true, to: "ACCEPTED" });
    if (p.ok) expect(p.answerDeadlineAt?.toISOString()).toBe(at(10 + 72).toISOString());
  });
  it("پذیرش/رد بعد از مهلت ممنوع", () => {
    expect(planSoAction("ACCEPT", facts("REQUESTED"), at(48), cfg)).toEqual({ ok: false, error: "deadline_passed" });
    expect(planSoAction("DECLINE", facts("REQUESTED"), at(49), cfg)).toEqual({ ok: false, error: "deadline_passed" });
    expect(planSoAction("ACCEPT", facts("REQUESTED"), at(47.9), cfg).ok).toBe(true);
  });
  it("پاسخ فقط از ACCEPTED و پیش از مهلت", () => {
    expect(planSoAction("ANSWER", facts("ACCEPTED"), at(50), cfg)).toMatchObject({ ok: true, to: "ANSWERED" });
    expect(planSoAction("ANSWER", facts("ACCEPTED"), at(72), cfg)).toEqual({ ok: false, error: "deadline_passed" });
    expect(planSoAction("ANSWER", facts("REQUESTED"), at(1), cfg)).toEqual({ ok: false, error: "invalid_state" });
  });
  it("لغو بیمار فقط از REQUESTED/ACCEPTED", () => {
    expect(planSoAction("CANCEL", facts("REQUESTED"), at(1)).ok).toBe(true);
    expect(planSoAction("CANCEL", facts("ACCEPTED"), at(1)).ok).toBe(true);
    for (const s of SO_TERMINAL) expect(planSoAction("CANCEL", facts(s), at(1))).toEqual({ ok: false, error: "invalid_state" });
  });
  it("انقضا فقط پس از مهلت مربوط به همان وضعیت", () => {
    expect(planSoAction("EXPIRE", facts("REQUESTED"), at(47), cfg)).toEqual({ ok: false, error: "not_yet_due" });
    expect(planSoAction("EXPIRE", facts("REQUESTED"), at(48), cfg)).toMatchObject({ ok: true, to: "EXPIRED" });
    expect(planSoAction("EXPIRE", facts("ACCEPTED"), at(71), cfg)).toEqual({ ok: false, error: "not_yet_due" });
    expect(planSoAction("EXPIRE", facts("ACCEPTED"), at(72), cfg)).toMatchObject({ ok: true, to: "EXPIRED" });
  });
  it("وضعیت‌های پایانی هیچ اقدامی نمی‌پذیرند", () => {
    for (const s of SO_TERMINAL) for (const a of ["ACCEPT", "DECLINE", "ANSWER", "CANCEL", "EXPIRE"] as const) {
      expect(planSoAction(a, facts(s), at(100), cfg).ok).toBe(false);
    }
  });
  it("هر اقدام یک بازیگر مشخص دارد", () => {
    expect(SO_ACTOR).toMatchObject({ ACCEPT: "doctor", DECLINE: "doctor", ANSWER: "doctor", CANCEL: "patient", EXPIRE: "system" });
  });
});

const PAT = "p1", DOC1 = "d1", DOC2 = "d2";
const req = (o: Partial<RequestFacts> = {}): RequestFacts => ({
  appointment: { status: "COMPLETED", patientId: PAT, doctorId: DOC1, endsAt: at(-24) }, requesterId: PAT,
  target: { id: DOC2, isListed: true, acceptsSecondOpinions: true },
  openCountForPatient: 0, countForAppointment: 0, duplicateOpenToSameDoctor: false, recordCount: 2, ...o,
});

describe("planSoRequest", () => {
  it("درخواست معتبر: مهلت پذیرش ۴۸ ساعت و انقضای اشتراک = ۴۸+۷۲ ساعت + ۷ روز", () => {
    const p = planSoRequest(req(), T0, cfg);
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.acceptDeadlineAt.toISOString()).toBe(at(48).toISOString());
      expect(p.sharesExpireAt.toISOString()).toBe(at(48 + 72 + 7 * 24).toISOString());
    }
  });
  it("فقط مالک نوبتِ COMPLETED", () => {
    expect(planSoRequest(req({ requesterId: "x" }), T0)).toEqual({ ok: false, error: "not_owner" });
    for (const s of ["CONFIRMED", "IN_PROGRESS", "CANCELLED_BY_DOCTOR", "NO_SHOW_PATIENT"]) {
      expect(planSoRequest(req({ appointment: { status: s, patientId: PAT, doctorId: DOC1, endsAt: at(-24) } }), T0)).toEqual({ ok: false, error: "appointment_not_completed" });
    }
  });
  it("پنجره‌ی ۳۰ روزه", () => {
    const old = req({ appointment: { status: "COMPLETED", patientId: PAT, doctorId: DOC1, endsAt: at(-24 * 31) } });
    expect(planSoRequest(old, T0)).toEqual({ ok: false, error: "request_window_passed" });
  });
  it("پزشک هدف: باید فهرست‌شده و پذیرنده باشد، نه پزشک اولیه و نه خودِ بیمار", () => {
    expect(planSoRequest(req({ target: null }), T0)).toEqual({ ok: false, error: "target_unavailable" });
    expect(planSoRequest(req({ target: { id: DOC2, isListed: false, acceptsSecondOpinions: true } }), T0)).toEqual({ ok: false, error: "target_unavailable" });
    expect(planSoRequest(req({ target: { id: DOC2, isListed: true, acceptsSecondOpinions: false } }), T0)).toEqual({ ok: false, error: "target_unavailable" });
    expect(planSoRequest(req({ target: { id: DOC1, isListed: true, acceptsSecondOpinions: true } }), T0)).toEqual({ ok: false, error: "same_doctor" });
    expect(planSoRequest(req({ target: { id: PAT, isListed: true, acceptsSecondOpinions: true } }), T0)).toEqual({ ok: false, error: "target_unavailable" });
  });
  it("سقف‌ها و تکراری", () => {
    expect(planSoRequest(req({ duplicateOpenToSameDoctor: true }), T0)).toEqual({ ok: false, error: "duplicate_request" });
    expect(planSoRequest(req({ countForAppointment: 3 }), T0)).toEqual({ ok: false, error: "too_many_for_appointment" });
    expect(planSoRequest(req({ openCountForPatient: 3 }), T0)).toEqual({ ok: false, error: "too_many_open" });
    expect(planSoRequest(req({ recordCount: 11 }), T0)).toEqual({ ok: false, error: "too_many_records" });
    expect(planSoRequest(req({ recordCount: 10 }), T0).ok).toBe(true);
  });
});
