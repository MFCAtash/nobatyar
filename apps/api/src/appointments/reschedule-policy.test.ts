import { describe, expect, it } from "vitest";
import { canActorReschedule, planReschedule } from "./reschedule-policy";

const cfg = { minLeadMinutes: 30 };
const now = new Date("2026-01-01T08:00:00.000Z");
const startsAt = new Date("2026-01-01T10:00:00.000Z");
const current = { status: "CONFIRMED" as const, startsAt, endsAt: new Date("2026-01-01T10:20:00.000Z") };

describe("planReschedule", () => {
  it("جابهجایی به اسلات معتبر و آینده مجاز است", () => {
    expect(planReschedule(current, new Date("2026-01-02T10:00:00.000Z"), now, cfg)).toEqual({ ok: true });
  });
  it("همان زمان، تغییری نیست", () => {
    expect(planReschedule(current, startsAt, now, cfg)).toEqual({ ok: false, error: "unchanged" });
  });
  it("کمتر از حداقل فاصله (minLead) رد میشود", () => {
    expect(planReschedule(current, new Date("2026-01-01T08:20:00.000Z"), now, cfg)).toEqual({ ok: false, error: "too_early" });
  });
  it("پس از شروع نوبت، جابهجایی ممنوع است", () => {
    expect(planReschedule(current, new Date("2026-01-01T09:00:00.000Z"), new Date("2026-01-01T10:01:00.000Z"), cfg))
      .toEqual({ ok: false, error: "too_late" });
  });
  it("فقط نوبت تأییدشده/منتظر تأیید قابل جابهجایی است", () => {
    for (const s of ["PENDING_PAYMENT", "COMPLETED", "CANCELLED_BY_PATIENT", "NO_SHOW_PATIENT"] as const) {
      expect(planReschedule({ ...current, status: s }, new Date("2026-01-02T10:00:00.000Z"), now, cfg))
        .toEqual({ ok: false, error: "invalid_state" });
    }
    expect(planReschedule({ ...current, status: "PENDING_CONFIRMATION" }, new Date("2026-01-02T10:00:00.000Z"), now, cfg))
      .toEqual({ ok: true });
  });
});

describe("canActorReschedule", () => {
  it("فقط بیمار و پزشک همان نوبت", () => {
    expect(canActorReschedule("p", "p", "d")).toBe(true);
    expect(canActorReschedule("d", "p", "d")).toBe(true);
    expect(canActorReschedule("admin", "p", "d")).toBe(false);
    expect(canActorReschedule("other", "p", "d")).toBe(false);
  });
});
