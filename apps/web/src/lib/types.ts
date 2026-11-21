export type Role = "PATIENT" | "DOCTOR" | "ADMIN";

export type AppointmentStatus =
  | "PENDING_PAYMENT" | "PENDING_CONFIRMATION" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED"
  | "CANCELLED_BY_PATIENT" | "CANCELLED_BY_DOCTOR" | "EXPIRED" | "NO_SHOW_PATIENT" | "NO_SHOW_DOCTOR";

export type AppointmentKind = "IN_PERSON" | "VIDEO" | "CHAT";

export interface Me {
  id: string;
  role: Role;
  phoneMasked: string;
  fullName: string;
  doctor: { isListed: boolean } | null;
  createdAt: string;
}

export interface Specialty { slug: string; nameFa: string }

export interface ClinicInfo { name: string | null; address: string | null; phone: string | null }
export interface DoctorCard {
  id: string;
  fullName: string;
  bio: string | null;
  consultationFeeRial: string;
  slotMinutes: number;
  clinic: ClinicInfo | null;
  specialties: Specialty[];
}

export interface DoctorSearch { total: number; page: number; limit: number; items: DoctorCard[] }

export interface RankedSlotView {
  startsAt: string; endsAt: string; score: number; reasonsFa: string[];
}
export interface SlotsResponse {
  timezone: string; slotMinutes: number; slots: { startsAt: string; endsAt: string }[];
  /** M3 — فقط زمانی که ranked=true و feature flag روشن است */
  ranked?: boolean; suggestions?: RankedSlotView[];
}

export interface AppointmentItem {
  id: string;
  doctor: { id: string; fullName: string; clinic?: ClinicInfo | null };
  patient: { id: string; fullName: string };
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  kind: AppointmentKind;
  priceRial: string;
  holdExpiresAt: string | null;
}
export interface AppointmentDetail extends AppointmentItem { reason: string | null }
export interface AppointmentList { items: AppointmentItem[]; nextCursor: string | null }

export interface ActionResult { id: string; status: AppointmentStatus; refundRial?: string }

export type VideoState = "OPEN" | "TOO_EARLY" | "ENDED" | "UNAVAILABLE" | "NOT_VIDEO";
export interface VideoStatus {
  available: boolean;
  state: VideoState;
  appointmentStatus: AppointmentStatus;
  role: "doctor" | "patient";
  opensAt: string | null;
  closesAt: string | null;
  peer: { fullName: string | null };
}
export interface VideoJoin {
  url: string;
  token: string;
  role: "doctor" | "patient";
  expiresAt: string;
  closesAt: string;
  peer: { fullName: string | null };
}

export interface RecordItem {
  id: string; title: string; category: string; visitDate: string | null;
  createdAt: string; attachmentCount: number;
}

export interface Consent { type: string; version: string; grantedAt: string; revokedAt: string | null }

export interface WeeklyRule { weekday: number; startTime: string; endTime: string }
export interface AvailabilityResponse {
  settings: {
    slotMinutes: number; autoConfirm: boolean; consultationFeeRial: string; bio: string | null;
    clinicName: string | null; clinicAddress: string | null; clinicPhone: string | null;
  };
  rules: WeeklyRule[];
}
export interface TimeOff { id: string; startsAt: string; endsAt: string; reason: string | null }

export interface VerificationItem {
  id: string; doctorId: string; status: string; documentKey: string; createdAt: string;
  doctor: { fullName: string; medicalCouncilNo: string | null };
}

// ───────────── فاز ۸ ─────────────
export type Urgency = "EMERGENCY" | "URGENT" | "SOON" | "ROUTINE" | "SELF_CARE";
export interface TriageFlag { id: string; textFa: string; level: Urgency }
export interface TriageCatalog { complaints: { code: string; labelFa: string }[] }
export interface TriageResult {
  engineVersion: string; urgency: Urgency; reasonsFa: string[]; redFlagsHit: TriageFlag[];
  specialties: { slug: string; score: number }[]; adviceFa: string[];
  suggestedKind: "NONE" | "VIDEO" | "IN_PERSON" | "EMERGENCY";
  emergencyContacts: { number: string; labelFa: string }[]; disclaimerFa: string;
}
export interface TriageRun { id: string; result: TriageResult; doctors: { id: string; fullName: string; consultationFeeRial: string; specialties: Specialty[] }[] }

export interface HealthProfile {
  allergies: string[]; chronicConditions: string[]; medications: string[];
  bloodType: string | null; pregnancy: "NO" | "YES" | "UNKNOWN"; notes: string; updatedAt?: string | null;
  /** فقط برای نمای پزشک: false ⇒ پروفایل ثبت نشده/نامرئی (نه «بدون حساسیت»). */
  exists?: boolean;
}

export interface Diagnosis { code?: string; text: string }
export interface SoapContent { subjective: string; objective: string; assessment: string; plan: string; diagnoses: Diagnosis[]; followUpDays: number | null }
export type SoapView =
  | { exists: false; appointmentStatus: AppointmentStatus }
  | { exists: true; appointmentStatus: AppointmentStatus; status: "DRAFT" | "SIGNED"; version: number; signedAt: string | null; updatedAt: string;
      content: SoapContent; patientSummary: string; addenda: { id: string; createdAt: string; body: string }[] };
export interface VisitSummary { text: string; followUpDays: number | null; publishedAt: string; doctorName: string }

export interface RxItem { drugName: string; form?: string; strength?: string; dose: string; frequency: string; durationDays: number; quantity: number; instructions?: string }
export interface Prescription {
  id: string; number: string; appointmentId: string; status: "ACTIVE" | "EXPIRED" | "CANCELLED"; issuedAt: string; validUntil: string; cancelledAt: string | null;
  doctor: { fullName: string }; patient: { fullName: string }; items: RxItem[]; verifyCode?: string; allergyWarningAcknowledged?: boolean;
}
export interface AllergyWarning { drugName: string; allergen: string; reasonFa: string }

export type SoStatus = "REQUESTED" | "ACCEPTED" | "DECLINED" | "ANSWERED" | "EXPIRED" | "CANCELLED";
export interface SoListItem { id: string; status: SoStatus; createdAt: string; acceptDeadlineAt: string; answerDeadlineAt: string | null; respondedAt: string | null; doctorName?: string }
export interface SoAnswer { opinion: string; recommendations?: string; needsInPerson: boolean; urgency?: "ROUTINE" | "SOON" | "URGENT" }
export interface SoDetail {
  id: string; status: SoStatus; createdAt: string; acceptDeadlineAt: string; answerDeadlineAt: string | null; respondedAt: string | null;
  role: "doctor" | "patient"; doctorName?: string; includeVisitSummary: boolean; appointmentId?: string;
  request: { question: string; caseSummary: string; ageYears: number | null; gender: string | null };
  response: SoAnswer | null;
  records: { id: string; title: string; category: string; attachmentCount: number }[];
  visitSummary: { text: string; followUpDays: number | null } | null;
}
export interface SoCandidate { id: string; fullName: string; bio: string | null; specialties: Specialty[]; sameSpecialty: boolean }

export interface RefundItem {
  id: string; status: "PENDING" | "PROCESSING" | "PROCESSED" | "FAILED" | "MANUAL" | "REVIEW";
  amountRial: string; reason: string | null; gateway: string | null; externalRef: string | null; tryCount: number; lastErrorCode: string | null;
  createdAt: string; processedAt: string | null; note: string | null; paymentId: string; appointmentId: string; attemptId: string | null; patientName: string | null;
  /** تأیید دو نفره (Maker/Checker) */
  approval: RefundApproval;
}
export interface RefundApproval {
  /** آیا برای این مبلغ تأیید دو نفره لازم است (سیاست سرور) */
  required: boolean;
  state: "NONE" | "REQUESTED" | "APPROVED" | "REJECTED"; action: "EXECUTE" | "MARK_PROCESSED" | null; reference: string | null;
  makerId: string | null; makerNote: string | null; requestedAt: string | null; checkerId: string | null; checkerNote: string | null; decidedAt: string | null;
}
export interface FinanceSummary {
  refunds: Record<string, { count: number; amountRial: string }>;
  attention: { paidUnsynced: number; staleInitiated: number; mismatchAttempts: number };
  paidLast24h: { count: number; amountRial: string };
}
export interface AdminPaymentItem {
  id: string; status: string; amountRial: string; gateway: string | null; paidAt: string | null; createdAt: string; synced: boolean;
  appointmentId: string; appointmentStatus: string;
  attempts: { gateway: string; status: string; failureCode: string | null; createdAt: string }[];
  refunds: { status: string; amountRial: string }[];
}

// ───────────── فاز ۱۹ ─────────────
export type ComponentStatus = "operational" | "degraded" | "outage";
export interface StatusComponent { id: string; nameFa: string; status: ComponentStatus }
export interface StatusIncident {
  id: string; titleFa: string; status: string; impact: string; componentId: string | null;
  startedAt: string; resolvedAt: string | null; updates: { status: string; bodyFa: string; at: string }[];
}
export interface StatusSnapshot { overall: ComponentStatus; updatedAt: string; components: StatusComponent[]; incidents: StatusIncident[] }

export interface MfaStatus { enabled: boolean; required: boolean; enrolledAt: string | null; recoveryCodesLeft: number }
export interface MfaEnroll { secret: string; uri: string; recoveryCodes: string[] }

export type VitalType = "BLOOD_PRESSURE" | "BLOOD_GLUCOSE" | "WEIGHT" | "HEART_RATE" | "BODY_TEMPERATURE" | "OXYGEN_SATURATION";
export type VitalFlag = "normal" | "watch" | "alert";
export interface VitalReading {
  id: string; patientId: string; patientName?: string | null;
  type: VitalType; valuePrimary: number; valueSecondary: number | null;
  unit: string; measuredAt: string; source: "MANUAL" | "DEVICE"; flag: VitalFlag;
}
export interface VitalList {
  items: VitalReading[]; nextCursor: string | null;
  trend: { direction: "up" | "down" | "flat"; deltaPerReading: number };
}

export interface ScribeDraft {
  subjective: string; objective: string; assessment: string; plan: string; patientSummary: string;
}
export interface ScribeStatus { status: string; draft: ScribeDraft | null }

export interface DataRequest {
  id: string; type: "EXPORT" | "DELETE"; status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "REJECTED";
  requestedAt: string; completedAt: string | null; objectKey: string | null;
}
