/**
 * سیاست یادداشت SOAP — توابع خالص.
 * S=شرح حال، O=یافته‌های معاینه، A=ارزیابی/تشخیص، P=برنامه‌ی درمان.
 * چرخه: DRAFT (قابل ویرایش) ⇒ SIGNED (تغییرناپذیر؛ تریگر DB هم اجبار می‌کند) ⇒ فقط «الحاقیه» (addendum) append-only.
 * بیمار فقط «خلاصه‌ی ویزیت برای بیمار» را آن هم پس از امضا می‌بیند، نه خود SOAP را.
 */
export const SOAP_LIMITS = { section: 8000, summary: 4000, diagnoses: 10, diagnosisText: 200, addendum: 4000, followUpDaysMax: 365 } as const;
export const ICD10_RE = /^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/;

export interface Diagnosis { code?: string; text: string }
export interface SoapContent {
  subjective: string; objective: string; assessment: string; plan: string;
  diagnoses: Diagnosis[]; followUpDays: number | null;
}
export interface SoapDraftInput extends Partial<SoapContent> { patientSummary?: string }

const t = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function normalizeSoap(raw: SoapDraftInput): { content: SoapContent; patientSummary: string } {
  const diagnoses = (Array.isArray(raw.diagnoses) ? raw.diagnoses : [])
    .map((d) => ({ code: d.code ? t(d.code, 12).toUpperCase() : undefined, text: t(d.text, SOAP_LIMITS.diagnosisText) }))
    .filter((d) => d.text.length > 0 || d.code)
    .slice(0, SOAP_LIMITS.diagnoses);
  const fu = raw.followUpDays;
  return {
    content: {
      subjective: t(raw.subjective, SOAP_LIMITS.section), objective: t(raw.objective, SOAP_LIMITS.section),
      assessment: t(raw.assessment, SOAP_LIMITS.section), plan: t(raw.plan, SOAP_LIMITS.section),
      diagnoses,
      followUpDays: typeof fu === "number" && Number.isInteger(fu) && fu >= 1 && fu <= SOAP_LIMITS.followUpDaysMax ? fu : null,
    },
    patientSummary: t(raw.patientSummary, SOAP_LIMITS.summary),
  };
}

export function diagnosisErrors(c: SoapContent): string[] {
  return c.diagnoses.flatMap((d, i) => (d.code && !ICD10_RE.test(d.code) ? [`diagnosis_code_invalid:${i}`] : []));
}

export function validateForSigning(c: SoapContent): string[] {
  const e = diagnosisErrors(c);
  if (!c.subjective && !c.objective && !c.assessment && !c.plan) e.push("nothing_to_sign");
  if (!c.assessment) e.push("assessment_required");
  if (!c.plan) e.push("plan_required");
  return e;
}

export interface SoapWriteFacts {
  appointmentStatus: string; endsAt: Date; userId: string; doctorId: string;
  existing: { status: "DRAFT" | "SIGNED" } | null;
}
export type SoapWriteError = "not_participant" | "invalid_state" | "window_closed" | "already_signed" | "not_signed";
export type SoapDecision = { ok: true } | { ok: false; error: SoapWriteError };

const DAY = 86_400_000;

/** نوشتن/ویرایش پیش‌نویس و امضا. */
export function planSoapEdit(f: SoapWriteFacts, now: Date, cfg: { editWindowDays: number }): SoapDecision {
  if (f.userId !== f.doctorId) return { ok: false, error: "not_participant" };
  if (f.appointmentStatus !== "IN_PROGRESS" && f.appointmentStatus !== "COMPLETED") return { ok: false, error: "invalid_state" };
  if (f.existing?.status === "SIGNED") return { ok: false, error: "already_signed" };
  if (f.appointmentStatus === "COMPLETED" && now.getTime() > f.endsAt.getTime() + cfg.editWindowDays * DAY) return { ok: false, error: "window_closed" };
  return { ok: true };
}

/** الحاقیه: فقط پزشک همان نوبت و فقط بعد از امضا؛ بدون محدودیت زمانی (append-only). */
export function planAddendum(f: SoapWriteFacts): SoapDecision {
  if (f.userId !== f.doctorId) return { ok: false, error: "not_participant" };
  if (f.existing?.status !== "SIGNED") return { ok: false, error: "not_signed" };
  return { ok: true };
}

export const patientMaySeeSummary = (status: "DRAFT" | "SIGNED"): boolean => status === "SIGNED";
