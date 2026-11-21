/** ماشین وضعیت نوبت — جزئیات در docs/appointment-rules.md */
export const APPOINTMENT_STATUSES = [
  "PENDING_PAYMENT",
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED_BY_PATIENT",
  "CANCELLED_BY_DOCTOR",
  "EXPIRED",
  "NO_SHOW_PATIENT",
  "NO_SHOW_DOCTOR",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  PENDING_PAYMENT: ["PENDING_CONFIRMATION", "CONFIRMED", "EXPIRED", "CANCELLED_BY_PATIENT"],
  PENDING_CONFIRMATION: ["CONFIRMED", "CANCELLED_BY_DOCTOR", "CANCELLED_BY_PATIENT", "EXPIRED"],
  CONFIRMED: ["IN_PROGRESS", "CANCELLED_BY_PATIENT", "CANCELLED_BY_DOCTOR", "NO_SHOW_PATIENT", "NO_SHOW_DOCTOR"],
  IN_PROGRESS: ["COMPLETED", "NO_SHOW_DOCTOR"],
  COMPLETED: [],
  CANCELLED_BY_PATIENT: [],
  CANCELLED_BY_DOCTOR: [],
  EXPIRED: [],
  NO_SHOW_PATIENT: [],
  NO_SHOW_DOCTOR: [],
};

/** وضعیت‌هایی که بازه‌ی زمانی پزشک را اشغال می‌کنند (برای قید جلوگیری از رزرو دوبل). */
export const SLOT_HOLDING_STATUSES: readonly AppointmentStatus[] = [
  "PENDING_PAYMENT",
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "IN_PROGRESS",
];

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return APPOINTMENT_TRANSITIONS[from].includes(to);
}
