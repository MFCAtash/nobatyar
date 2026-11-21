export const APPOINTMENT_NOTIFIER = Symbol("APPOINTMENT_NOTIFIER");

export interface ReminderInput {
  appointmentId: string;
  patientId: string;
  doctorId: string;
  startsAt: Date;
  kind: "24h" | "1h";
}

/** درگاه اعلان — پیاده‌سازی واقعی (پیامک/پوش) در فاز ۶. متن پیام‌ها نباید داده‌ی سلامت داشته باشد. */
export interface AppointmentNotifier {
  reminder(input: ReminderInput): Promise<void>;
}

export class NoopNotifier implements AppointmentNotifier {
  async reminder(): Promise<void> {
    /* no-op تا فاز ۶ */
  }
}
