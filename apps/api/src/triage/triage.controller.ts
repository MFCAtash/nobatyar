import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { z } from "zod";
import { AuthUser, CurrentUser, RequireConsent, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { MAX_SYMPTOMS, TriageInput } from "./triage-engine";
import { TriageService } from "./triage.service";

const symptom = z.object({ code: z.string().max(40), severity: z.union([z.literal(1), z.literal(2), z.literal(3)]), durationDays: z.number().int().min(0).max(3650).optional() }).strict();
const base = {
  ageYears: z.number().int().min(0).max(120),
  sex: z.enum(["MALE", "FEMALE"]).optional(),
  pregnant: z.boolean().optional(),
  symptoms: z.array(symptom).min(1).max(MAX_SYMPTOMS),
};
const flagsSchema = z.object(base).strict();
const runSchema = z.object({ ...base, redFlags: z.array(z.string().max(40)).max(60).default([]) }).strict();

@Controller("triage")
@Roles("PATIENT")
export class TriageController {
  constructor(@Inject(TriageService) private readonly svc: TriageService) {}

  @Get("catalog") catalog() { return this.svc.catalog(); }

  /** مرحله‌ی دوم ویزارد: چه پرچم‌های قرمزی بپرسیم؟ (بدون ذخیره) */
  @HttpCode(200) @Post("flags")
  flags(@Body(new ZodPipe(flagsSchema)) b: z.infer<typeof flagsSchema>) {
    return this.svc.flagsFor(b as Pick<TriageInput, "ageYears" | "pregnant" | "symptoms">);
  }

  @RequireConsent("HEALTH_DATA_PROCESSING") @HttpCode(200) @Post()
  run(@CurrentUser() u: AuthUser, @Body(new ZodPipe(runSchema)) b: z.infer<typeof runSchema>) {
    return this.svc.run(u, b as TriageInput);
  }

  @Get() history(@CurrentUser() u: AuthUser) { return this.svc.history(u); }
  @Get(":id") one(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) { return this.svc.getOne(u, id); }
}
