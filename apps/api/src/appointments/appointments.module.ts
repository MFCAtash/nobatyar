import { Module } from "@nestjs/common";
import { VideoModule } from "../video/video.module";
import { NotificationModule } from "../notifications/notification.module";
import { AuditModule } from "../audit/audit.module";
import { AppointmentsController } from "./appointments.controller";
import { AppointmentsService } from "./appointments.service";
import { RescheduleController } from "./reschedule.controller";
import { RescheduleService } from "./reschedule.service";
import { WaitlistService } from "./waitlist.service";
import { WaitlistController } from "./waitlist.controller";
import { RecurringController } from "./recurring.controller";
import { RecurringService } from "./recurring.service";

@Module({
  imports: [VideoModule, NotificationModule, AuditModule],
  controllers: [AppointmentsController, RescheduleController, WaitlistController, RecurringController],
  providers: [AppointmentsService, RescheduleService, WaitlistService, RecurringService],
  exports: [AppointmentsService, RecurringService, RescheduleService, WaitlistService],
})
export class AppointmentsModule {}
