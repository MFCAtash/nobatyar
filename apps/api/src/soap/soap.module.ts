import { Module } from "@nestjs/common";
import { NotificationModule } from "../notifications/notification.module";
import { SoapController } from "./soap.controller";
import { SoapService } from "./soap.service";

@Module({ imports: [NotificationModule], controllers: [SoapController], providers: [SoapService], exports: [SoapService] })
export class SoapModule {}
