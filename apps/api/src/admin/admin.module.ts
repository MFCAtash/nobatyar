import { Module } from "@nestjs/common";
import { PaymentModule } from "../payment/payment.module";
import { PrismaModule } from "../prisma/prisma.module";
import { FinanceController } from "./finance.controller";
import { OpenApiController } from "../openapi/openapi.controller";
import { UserAdminController } from "./user-admin.controller";
import { VerificationController } from "./verification.controller";
import { DataRequestController } from "./data-request.controller";
import { DataRequestService } from "../records/data-request.service";
import { FhirModule } from "../records/fhir.module";
import { StorageModule } from "../storage/storage.module";
import { NotificationModule } from "../notifications/notification.module";
import { CryptoModule } from "../crypto/crypto.module";
import { AuditModule } from "../audit/audit.module";
import { AuditVerifierService } from "../audit/audit-verifier.service";
import { AuditController } from "./audit.controller";

@Module({
  imports: [PrismaModule, PaymentModule, FhirModule, StorageModule, NotificationModule, CryptoModule, AuditModule],
  controllers: [VerificationController, FinanceController, UserAdminController, OpenApiController, DataRequestController, AuditController],
  providers: [DataRequestService, AuditVerifierService],
  exports: [DataRequestService, AuditVerifierService],
})
export class AdminModule {}
