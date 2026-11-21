import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CryptoModule } from "../crypto/crypto.module";
import { NotificationModule } from "../notifications/notification.module";
import { OutboxModule } from "../outbox/outbox.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SoapModule } from "../soap/soap.module";
import { ScribeController } from "./scribe.controller";
import { ScribeService } from "./scribe.service";

@Module({
  imports: [PrismaModule, CryptoModule, AuditModule, NotificationModule, OutboxModule, SoapModule],
  controllers: [ScribeController],
  providers: [ScribeService],
  exports: [ScribeService],
})
export class ScribeModule {}
