import { Module } from "@nestjs/common";
import { NotificationModule } from "../notifications/notification.module";
import { SecondOpinionController } from "./second-opinion.controller";
import { SecondOpinionService } from "./second-opinion.service";

@Module({ imports: [NotificationModule], controllers: [SecondOpinionController], providers: [SecondOpinionService], exports: [SecondOpinionService] })
export class SecondOpinionModule {}
