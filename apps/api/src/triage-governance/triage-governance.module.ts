import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { TriageGovernanceAdminController, TriageGovernanceController } from "./ruleset.controller";
import { TriageGovernanceService } from "./ruleset.service";

@Module({
  imports: [PrismaModule],
  controllers: [TriageGovernanceController, TriageGovernanceAdminController],
  providers: [TriageGovernanceService],
  exports: [TriageGovernanceService],
})
export class TriageGovernanceModule {}
