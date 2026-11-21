import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { PrismaModule } from "../prisma/prisma.module";
import { HttpObservabilityInterceptor } from "./http.interceptor";
import { loadOpsConfig, OPS_CONFIG } from "./ops.config";
import { OpsController } from "./ops.controller";
import { SentryExceptionFilter } from "./sentry.filter";

@Module({
  imports: [PrismaModule],
  controllers: [OpsController],
  providers: [
    { provide: OPS_CONFIG, useFactory: () => loadOpsConfig() }, // METRICS_TOKEN/ACCESS_LOG نامعتبر ⇒ اپ بالا نمی‌آید
    { provide: APP_FILTER, useClass: SentryExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: HttpObservabilityInterceptor },
  ],
})
export class ObservabilityModule {}
