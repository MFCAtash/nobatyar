import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { UiPreferencesController } from "./ui-preferences.controller";
import { UiPreferencesService } from "./ui-preferences.service";

@Module({
  imports: [PrismaModule],
  controllers: [UiPreferencesController],
  providers: [UiPreferencesService],
  exports: [UiPreferencesService],
})
export class DesignModule {}
