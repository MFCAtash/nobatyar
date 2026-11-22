import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ReadModelController } from "./read-model.controller";
import { ReadModelService } from "./read-model.service";
import { AnalyticsAdminController, FeedbackController, FunnelController } from "./funnel.controller";
import { FunnelService } from "./funnel.service";

@Module({
  imports: [PrismaModule],
  controllers: [ReadModelController, FunnelController, FeedbackController, AnalyticsAdminController],
  providers: [ReadModelService, FunnelService],
  exports: [ReadModelService, FunnelService],
})
export class AnalyticsModule {}
