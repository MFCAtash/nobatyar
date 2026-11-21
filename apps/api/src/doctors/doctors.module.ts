import { Module } from "@nestjs/common";
import { DoctorApplicationController } from "./doctor-application.controller";
import { DoctorDirectoryController, SpecialtiesController } from "./doctor-directory.controller";
import { DoctorScheduleController } from "./doctor-schedule.controller";

// ترتیب مهم: مسیرهای ثابت (me، applications) پیش از :id
@Module({ controllers: [DoctorScheduleController, DoctorApplicationController, DoctorDirectoryController, SpecialtiesController] })
export class DoctorsModule {}
