import { describe, expect, it } from "vitest";
import { normalizeSoap, patientMaySeeSummary, planAddendum, planSoapEdit, SOAP_LIMITS, validateForSigning } from "./soap-policy";
import type { SoapWriteFacts } from "./soap-policy";

const ends = new Date("2026-10-20T10:20:00Z");
const day = (d: number) => new Date(ends.getTime() + d * 86_400_000);
const cfg = { editWindowDays: 7 };
const f = (o: Partial<SoapWriteFacts> = {}): SoapWriteFacts => ({ appointmentStatus: "IN_PROGRESS", endsAt: ends, userId: "d", doctorId: "d", existing: null, ...o });

describe("planSoapEdit", () => {
  it("پزشک همان نوبت در IN_PROGRESS/COMPLETED می‌نویسد", () => {
    expect(planSoapEdit(f(), ends, cfg).ok).toBe(true);
    expect(planSoapEdit(f({ appointmentStatus: "COMPLETED", existing: { status: "DRAFT" } }), day(3), cfg).ok).toBe(true);
  });
  it("بیمار/ادمین/پزشک دیگر ممنوع", () => {
    expect(planSoapEdit(f({ userId: "p" }), ends, cfg)).toEqual({ ok: false, error: "not_participant" });
  });
  it("وضعیت‌های دیگر نوبت ممنوع", () => {
    for (const s of ["CONFIRMED", "PENDING_PAYMENT", "CANCELLED_BY_DOCTOR", "NO_SHOW_PATIENT", "EXPIRED"]) {
      expect(planSoapEdit(f({ appointmentStatus: s }), ends, cfg)).toEqual({ ok: false, error: "invalid_state" });
    }
  });
  it("پس از ۷ روز از پایان نوبت پنجره بسته است (فقط الحاقیه)", () => {
    expect(planSoapEdit(f({ appointmentStatus: "COMPLETED" }), day(7), cfg).ok).toBe(true);
    expect(planSoapEdit(f({ appointmentStatus: "COMPLETED" }), new Date(day(7).getTime() + 1), cfg)).toEqual({ ok: false, error: "window_closed" });
  });
  it("امضاشده تغییرناپذیر است", () => {
    expect(planSoapEdit(f({ existing: { status: "SIGNED" } }), ends, cfg)).toEqual({ ok: false, error: "already_signed" });
  });
});

describe("planAddendum", () => {
  it("فقط بعد از امضا و فقط پزشک؛ بدون محدودیت زمانی", () => {
    expect(planAddendum(f({ existing: { status: "SIGNED" }, appointmentStatus: "COMPLETED" })).ok).toBe(true);
    expect(planAddendum(f({ existing: { status: "DRAFT" } }))).toEqual({ ok: false, error: "not_signed" });
    expect(planAddendum(f({ existing: null }))).toEqual({ ok: false, error: "not_signed" });
    expect(planAddendum(f({ existing: { status: "SIGNED" }, userId: "p" }))).toEqual({ ok: false, error: "not_participant" });
  });
});

describe("normalizeSoap / validateForSigning", () => {
  it("رشته‌ها trim و کوتاه می‌شوند؛ تشخیص‌ها محدود و ICD-10 بزرگ‌حرف", () => {
    const { content, patientSummary } = normalizeSoap({
      subjective: "  سرفه  ", assessment: "x".repeat(SOAP_LIMITS.section + 50), plan: " استراحت ",
      diagnoses: [{ code: "j06.9", text: " عفونت ویروسی " }, { text: "" }, ...Array.from({ length: 20 }, (_, i) => ({ text: `d${i}` }))],
      followUpDays: 7, patientSummary: "  خلاصه ",
    });
    expect(content.subjective).toBe("سرفه");
    expect(content.assessment).toHaveLength(SOAP_LIMITS.section);
    expect(content.diagnoses).toHaveLength(SOAP_LIMITS.diagnoses);
    expect(content.diagnoses[0]).toEqual({ code: "J06.9", text: "عفونت ویروسی" });
    expect(content.followUpDays).toBe(7);
    expect(patientSummary).toBe("خلاصه");
  });
  it("followUpDays نامعتبر ⇒ null؛ ورودی غیررشته‌ای بی‌خطر", () => {
    expect(normalizeSoap({ followUpDays: 0 }).content.followUpDays).toBeNull();
    expect(normalizeSoap({ followUpDays: 1.5 }).content.followUpDays).toBeNull();
    expect(normalizeSoap({ followUpDays: 400 }).content.followUpDays).toBeNull();
    expect(normalizeSoap({ subjective: 42 as never }).content.subjective).toBe("");
  });
  it("امضا: ارزیابی و برنامه الزامی؛ کد ICD نامعتبر رد می‌شود", () => {
    expect(validateForSigning(normalizeSoap({}).content)).toContain("nothing_to_sign");
    const e = validateForSigning(normalizeSoap({ subjective: "الف" }).content);
    expect(e).toContain("assessment_required"); expect(e).toContain("plan_required");
    expect(validateForSigning(normalizeSoap({ assessment: "a", plan: "p", diagnoses: [{ code: "ZZ", text: "x" }] }).content)).toContain("diagnosis_code_invalid:0");
    expect(validateForSigning(normalizeSoap({ assessment: "a", plan: "p", diagnoses: [{ code: "J06.9", text: "x" }, { code: "E11", text: "y" }] }).content)).toEqual([]);
  });
  it("بیمار فقط خلاصه‌ی امضاشده را می‌بیند", () => {
    expect(patientMaySeeSummary("SIGNED")).toBe(true);
    expect(patientMaySeeSummary("DRAFT")).toBe(false);
  });
});
