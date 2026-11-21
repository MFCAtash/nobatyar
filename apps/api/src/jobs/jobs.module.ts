import { Module } from "@nestjs/common";
import { AppointmentsModule } from "../appointments/appointments.module";
import { PaymentModule } from "../payment/payment.module";
import { SecondOpinionModule } from "../second-opinion/second-opinion.module";
import { NotificationModule } from "../notifications/notification.module";
import { APPOINTMENT_NOTIFIER } from "../notifications/notifier";
import { PushAppointmentNotifier } from "../notifications/push-notifier";
import { PushModule } from "../push/push.module";
import { ScribeModule } from "../scribe/scribe.module";
import { AdminModule } from "../admin/admin.module";
import { AppointmentJobs } from "./appointment-jobs";
import { SchedulerService } from "./scheduler.service";

@Module({
  imports: [AppointmentsModule, SecondOpinionModule, PaymentModule, NotificationModule, PushModule, ScribeModule, AdminModule],
  providers: [AppointmentJobs, SchedulerService, { provide: APPOINTMENT_NOTIFIER, useClass: PushAppointmentNotifier }],
  exports: [AppointmentJobs, APPOINTMENT_NOTIFIER],
})
export class JobsModule {}
