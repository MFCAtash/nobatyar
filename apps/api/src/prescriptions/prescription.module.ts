import { Module } from "@nestjs/common";
import { HealthProfileModule } from "../health-profile/health-profile.module";
import { NotificationModule } from "../notifications/notification.module";
import { PrescriptionController } from "./prescription.controller";
import { PrescriptionService } from "./prescription.service";

@Module({ imports: [HealthProfileModule, NotificationModule], controllers: [PrescriptionController], providers: [PrescriptionService], exports: [PrescriptionService] })
export class PrescriptionModule {}
