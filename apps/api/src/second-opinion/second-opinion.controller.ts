import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { AuthUser, CurrentUser, RequireConsent, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { SecondOpinionService } from "./second-opinion.service";

const requestSchema = z.object({
  appointmentId: z.string().uuid(), doctorId: z.string().uuid(),
  question: z.string().trim().min(10).max(2000), caseSummary: z.string().trim().max(4000).default(""),
  ageYears: z.number().int().min(0).max(120).optional(), gender: z.enum(["MALE", "FEMALE"]).optional(),
  recordIds: z.array(z.string().uuid()).max(10).default([]), includeVisitSummary: z.boolean().default(false),
}).strict();
const answerSchema = z.object({
  opinion: z.string().trim().min(20).max(8000), recommendations: z.string().trim().max(4000).optional(),
  needsInPerson: z.boolean(), urgency: z.enum(["ROUTINE", "SOON", "URGENT"]).optional(),
}).strict();
const settingsSchema = z.object({ accepts: z.boolean() }).strict();
const candQuery = z.object({ appointmentId: z.string().uuid() });

@Controller("second-opinions")
export class SecondOpinionController {
  constructor(@Inject(SecondOpinionService) private readonly svc: SecondOpinionService) {}

  @Roles("DOCTOR") @Get("settings") settings(@CurrentUser() u: AuthUser) { return this.svc.getSettings(u); }
  @Roles("DOCTOR") @Patch("settings") setSettings(@CurrentUser() u: AuthUser, @Body(new ZodPipe(settingsSchema)) b: z.infer<typeof settingsSchema>) { return this.svc.setSettings(u, b.accepts); }

  @Roles("PATIENT") @Get("candidates")
  candidates(@CurrentUser() u: AuthUser, @Query(new ZodPipe(candQuery)) q: z.infer<typeof candQuery>) { return this.svc.candidates(u, q.appointmentId); }

  @Roles("PATIENT") @RequireConsent("HEALTH_DATA_PROCESSING") @Post()
  request(@CurrentUser() u: AuthUser, @Body(new ZodPipe(requestSchema)) b: z.infer<typeof requestSchema>) { return this.svc.request(u, b); }

  @Roles("PATIENT", "DOCTOR") @Get() list(@CurrentUser() u: AuthUser) { return this.svc.list(u); }
  @Roles("PATIENT", "DOCTOR") @Get(":id") get(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) { return this.svc.get(u, id); }

  @Roles("DOCTOR") @HttpCode(200) @Post(":id/accept") accept(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) { return this.svc.accept(u, id); }
  @Roles("DOCTOR") @HttpCode(200) @Post(":id/decline") decline(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) { return this.svc.decline(u, id); }
  @Roles("DOCTOR") @HttpCode(200) @Post(":id/answer")
  answer(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string, @Body(new ZodPipe(answerSchema)) b: z.infer<typeof answerSchema>) { return this.svc.answer(u, id, b); }
  @Roles("PATIENT") @HttpCode(200) @Post(":id/cancel") cancel(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) { return this.svc.cancel(u, id); }
}
