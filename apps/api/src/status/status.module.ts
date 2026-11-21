import { Module } from "@nestjs/common";
import { IncidentAdminController } from "./incident-admin.controller";
import { StatusController } from "./status.controller";
import { StatusService } from "./status.service";

@Module({ controllers: [StatusController, IncidentAdminController], providers: [StatusService], exports: [StatusService] })
export class StatusModule {}
