import { Module } from "@nestjs/common";
import "./common/bigint-json";
import { AdminModule } from "./admin/admin.module";
import { PaymentModule } from "./payment/payment.module";
import { NotificationModule } from "./notifications/notification.module";
import { FamilyModule } from "./family/family.module";
import { CompareModule }  from "./compare/compare.module";
import { ChatModule }     from "./chat/chat.module";
import { RecordsModule }  from "./records/records.module";
import { StorageModule }  from "./storage/storage.module";
import { VideoModule }    from "./video/video.module";
import { HealthProfileModule } from "./health-profile/health-profile.module";
import { PrescriptionModule } from "./prescriptions/prescription.module";
import { SecondOpinionModule } from "./second-opinion/second-opinion.module";
import { SoapModule } from "./soap/soap.module";
import { TriageModule } from "./triage/triage.module";
import { AppointmentsModule } from "./appointments/appointments.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { ConfigModule } from "./config/config.module";
import { CryptoModule } from "./crypto/crypto.module";
import { DoctorsModule } from "./doctors/doctors.module";
import { StatusModule } from "./status/status.module";
import { OutboxModule } from "./outbox/outbox.module";
import { IdempotencyModule } from "./idempotency/idempotency.module";
import { HealthController } from "./health.controller";
import { JobsModule } from "./jobs/jobs.module";
import { MeModule } from "./me/me.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { SchedulingModule } from "./scheduling/scheduling.module";
import { SmsModule } from "./sms/sms.module";
import { E2eModule } from "./e2e/e2e.module";
import { PushModule } from "./push/push.module";
import { ObservabilityModule } from "./observability/observability.module";
import { VitalsModule } from "./vitals/vitals.module";
import { ScribeModule } from "./scribe/scribe.module";
import { FhirModule } from "./records/fhir.module";
import { WalletModule } from "./wallet/wallet.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { KmsModule } from "./crypto/kms/kms.module";
import { TriageGovernanceModule } from "./triage-governance/triage-governance.module";
import { GrowthModule } from "./growth/growth.module";
import { DesignModule } from "./design/design.module";

@Module({
  imports: [
    ConfigModule, SchedulingModule, CryptoModule, PrismaModule, AuditModule, RedisModule, SmsModule, IdempotencyModule, OutboxModule, StatusModule,
    // KMS (Vault Transit): fail-closed در production؛ در dev به FIELD_KEYS برمیگردد.
    KmsModule,
    AuthModule, MeModule, DoctorsModule, AppointmentsModule, JobsModule, AdminModule,
    PaymentModule,
    PushModule,
    ObservabilityModule,
    // hook های تست: فقط با E2E_TEST_HOOKS=true (و در production کلاً ممنوع؛ auth.config)
    ...(process.env.E2E_TEST_HOOKS === "true" && process.env.NODE_ENV !== "production" ? [E2eModule] : []),
    NotificationModule,
    FamilyModule,
    CompareModule,
    StorageModule,
    ChatModule,
    RecordsModule,
    VideoModule,
    // فاز ۸
    HealthProfileModule, TriageModule, SoapModule, PrescriptionModule, SecondOpinionModule,
    // فاز ۱۹
    VitalsModule, ScribeModule, FhirModule, WalletModule, AnalyticsModule,
    // M10/M14/M15 (ارتقا)
    TriageGovernanceModule, GrowthModule, DesignModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
