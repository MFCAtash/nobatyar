/**
 * M8 — سیاست اتاق ویدئو (خالص).
 *
 * هدف: «ضبط» هرگز به‌صورت پیش‌فرض روشن نشود و بدون رضایت دوطرفه ممکن نباشد.
 */

export interface RoomPolicy {
  waitingRoom: boolean;
  allowScreenShare: boolean;
  captions: boolean;
  recordConsent: boolean;
  retentionHours: number | null;
}

export const DEFAULT_ROOM_POLICY: RoomPolicy = {
  waitingRoom: true,
  allowScreenShare: false,
  captions: true,
  recordConsent: false,
  retentionHours: 24,
};

const MAX_RETENTION_HOURS = 24 * 30;

export function normalizePolicy(input: Partial<RoomPolicy> | null | undefined): RoomPolicy {
  const p = { ...DEFAULT_ROOM_POLICY, ...(input ?? {}) };
  const hours = p.retentionHours;
  return {
    waitingRoom: p.waitingRoom !== false,
    allowScreenShare: p.allowScreenShare === true,
    captions: p.captions !== false,
    recordConsent: p.recordConsent === true,
    retentionHours:
      hours === null || hours === undefined || !Number.isFinite(hours)
        ? null
        : Math.min(Math.max(Math.trunc(hours), 1), MAX_RETENTION_HOURS),
  };
}

export interface RecordingConsent {
  patient: boolean;
  doctor: boolean;
}

/** ضبط فقط با رضایت هر دو طرف و روشن‌بودن سیاست. */
export function canRecord(policy: RoomPolicy, consent: RecordingConsent): boolean {
  return policy.recordConsent && consent.patient && consent.doctor;
}

/** مهلت نگهداری؛ null یعنی «تا حذف دستی» (که باید در runbook پایش شود). */
export function retentionDeadline(startedAt: Date, policy: RoomPolicy): Date | null {
  if (policy.retentionHours === null) return null;
  return new Date(startedAt.getTime() + policy.retentionHours * 3_600_000);
}

export type JoinGate = "allow" | "wait";

/**
 * اتاق انتظار: بیمار تا پذیرش پزشک در حالت wait می‌ماند؛ پزشک همیشه وارد می‌شود.
 */
export function joinGate(policy: RoomPolicy, role: "patient" | "doctor", admitted: boolean): JoinGate {
  if (role === "doctor") return "allow";
  if (!policy.waitingRoom) return "allow";
  return admitted ? "allow" : "wait";
}

/** امضای رضایت‌نامهٔ ضبط (برای ledger و جلوگیری از جعل ساده). */
export function recordingConsentHash(appointmentId: string, userId: string): string {
  return `VIDEO_RECORDING:v1:${appointmentId}:${userId}`;
}
