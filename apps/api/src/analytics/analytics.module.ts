import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ReadModelController } from "./read-model.controller";
import { ReadModelService } from "./read-model.service";

@Module({
  imports: [PrismaModule],
  controllers: [ReadModelController],
  providers: [ReadModelService],
  exports: [ReadModelService],
})
export class AnalyticsModule {}
