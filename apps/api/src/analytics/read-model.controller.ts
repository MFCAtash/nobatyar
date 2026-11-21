import { Controller, Get, Inject, Query } from "@nestjs/common";
import { AuthUser, CurrentUser, Roles } from "../common/decorators";
import { ReadModelService } from "./read-model.service";

@Roles("DOCTOR")
@Controller("doctor/stats")
export class ReadModelController {
  constructor(@Inject(ReadModelService) private readonly models: ReadModelService) {}

  @Get("daily")
  daily(@CurrentUser() u: AuthUser, @Query("days") days?: string) {
    return this.models.daily(u, days ? Number(days) : 30);
  }

  @Get("summary")
  summary(@CurrentUser() u: AuthUser, @Query("days") days?: string) {
    return this.models.summary(u, days ? Number(days) : 30);
  }
}
