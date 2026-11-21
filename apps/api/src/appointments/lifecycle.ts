export const APPOINTMENT_LIFECYCLE = Symbol("APPOINTMENT_LIFECYCLE");

/**
 * قلاب پایان نوبت (پس از commit موفق). شکست قلاب هرگز نباید تغییر وضعیت نوبت را برگرداند؛
 * AppointmentsService خطا را فقط لاگ می‌کند. در فاز ۷ برای بستن اتاق ویدئو استفاده می‌شود.
 */
export interface AppointmentLifecycleHook {
  onFinished(appointmentId: string): Promise<void>;
}
