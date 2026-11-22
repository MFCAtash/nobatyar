import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { CurrentUser, RequireConsent, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import type { AuthUser } from "../common/decorators";
import { createRecurringSchema, type CreateRecurringDto } from "./recurring.schemas";
import { RecurringService } from "./recurring.service";

@Controller("appointments/recurring")
export class RecurringController {
  constructor(private readonly svc: RecurringService) {}

  @Roles("PATIENT")
  @RequireConsent("HEALTH_DATA_PROCESSING")
  @Post()
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(createRecurringSchema)) body: CreateRecurringDto) {
    return this.svc.create(u, body);
  }

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.svc.list(u);
  }

  @Delete(":id")
  @HttpCode(200)
  cancel(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.cancel(u, id);
  }
}
