import { Inject, Injectable, Logger } from "@nestjs/common";
import { PushService } from "../push/push.service";
import { buildReminderPayload } from "../push/push-payload";
import { NotificationService } from "./notification.service";
import type { AppointmentNotifier, ReminderInput } from "./notifier";

/**
 * یادآوری نوبت: اعلان درون‌برنامه‌ای (DB + SSE) و Web Push برای بیمار و پزشک.
 * متن عمومی است و هیچ داده‌ی سلامتی ندارد (push-payload.ts). خطای پوش هرگز job را نمی‌شکند.
 */
@Injectable()
export class PushAppointmentNotifier implements AppointmentNotifier {
  private readonly log = new Logger(PushAppointmentNotifier.name);

  constructor(
    @Inject(NotificationService) private readonly notifications: NotificationService,
    @Inject(PushService) private readonly push: PushService,
  ) {}

  async reminder(i: ReminderInput): Promise<void> {
    const p = buildReminderPayload(i.kind, i.appointmentId);
    for (const userId of new Set([i.patientId, i.doctorId])) {
      await this.notifications.push(userId, { kind: "APPOINTMENT_REMINDER", titleFa: p.title, bodyFa: p.body, payload: { appointmentId: i.appointmentId, reminder: i.kind } });
      try {
        await this.push.sendToUser(userId, p);
      } catch (e) {
        this.log.warn(`push reminder failed: ${(e as Error).name}`);
      }
    }
  }
}
