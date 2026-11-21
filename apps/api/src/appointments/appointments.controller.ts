import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { AuthUser, CurrentUser, RequireConsent, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { AppointmentsService } from "./appointments.service";
import { bookSchema, BookInput, listSchema, ListInput } from "./schemas";

@Controller("appointments")
export class AppointmentsController {
  constructor(@Inject(AppointmentsService) private readonly svc: AppointmentsService) {}

  @Roles("PATIENT")
  @RequireConsent("HEALTH_DATA_PROCESSING")
  @Post()
  book(@CurrentUser() u: AuthUser, @Body(new ZodPipe(bookSchema)) body: BookInput) {
    return this.svc.book(u, body);
  }

  @Get()
  list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(listSchema)) q: ListInput) {
    return this.svc.list(u, q);
  }

  @Get(":id")
  get(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.get(u, id);
  }

  @Roles("DOCTOR")
  @HttpCode(200)
  @Post(":id/confirm")
  confirm(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.confirm(u, id);
  }

  @Roles("PATIENT", "DOCTOR")
  @HttpCode(200)
  @Post(":id/cancel")
  cancel(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.cancel(u, id);
  }

  @Roles("DOCTOR")
  @HttpCode(200)
  @Post(":id/start")
  start(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.start(u, id);
  }

  @Roles("DOCTOR")
  @HttpCode(200)
  @Post(":id/complete")
  complete(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.complete(u, id);
  }

  /** پزشک: غیبت بیمار — بیمار: غیبت پزشک */
  @Roles("PATIENT", "DOCTOR")
  @HttpCode(200)
  @Post(":id/report-no-show")
  reportNoShow(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.reportNoShow(u, id);
  }
}
