import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CryptoModule } from "../crypto/crypto.module";
import { NotificationModule } from "../notifications/notification.module";
import { PrismaModule } from "../prisma/prisma.module";
import { VitalsController } from "./vitals.controller";
import { VitalsService } from "./vitals.service";

@Module({ imports: [PrismaModule, CryptoModule, AuditModule, NotificationModule], controllers: [VitalsController], providers: [VitalsService], exports: [VitalsService] })
export class VitalsModule {}
