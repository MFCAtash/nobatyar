import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CryptoModule } from "../crypto/crypto.module";
import { PrismaModule } from "../prisma/prisma.module";
import { StorageModule } from "../storage/storage.module";
import { FhirController } from "./fhir.controller";
import { FhirService } from "./fhir.service";

@Module({ imports: [PrismaModule, CryptoModule, AuditModule, StorageModule], controllers: [FhirController], providers: [FhirService], exports: [FhirService] })
export class FhirModule {}
