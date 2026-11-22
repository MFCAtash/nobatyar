import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { GrowthAdminController, GrowthController } from "./clinics.controller";
import { GrowthService } from "./clinics.service";

@Module({
  imports: [PrismaModule],
  controllers: [GrowthController, GrowthAdminController],
  providers: [GrowthService],
  exports: [GrowthService],
})
export class GrowthModule {}
