import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Put } from "@nestjs/common";
import { z } from "zod";
import { AuthUser, CurrentUser, RequireConsent, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { BLOOD_TYPES, HP_LIMITS, PREGNANCY } from "./health-profile";
import { HealthProfileService } from "./health-profile.service";

const item = z.string().trim().min(1).max(HP_LIMITS.itemLen);
const schema = z.object({
  allergies: z.array(item).max(HP_LIMITS.items).default([]),
  chronicConditions: z.array(item).max(HP_LIMITS.items).default([]),
  medications: z.array(item).max(HP_LIMITS.items).default([]),
  bloodType: z.enum(BLOOD_TYPES).nullable().default(null),
  pregnancy: z.enum(PREGNANCY).default("UNKNOWN"),
  notes: z.string().max(HP_LIMITS.notes).default(""),
}).strict();

@Controller()
export class HealthProfileController {
  constructor(@Inject(HealthProfileService) private readonly svc: HealthProfileService) {}

  @Roles("PATIENT") @Get("me/health-profile")
  mine(@CurrentUser() u: AuthUser) { return this.svc.getMine(u); }

  @Roles("PATIENT") @RequireConsent("HEALTH_DATA_PROCESSING") @Put("me/health-profile")
  save(@CurrentUser() u: AuthUser, @Body(new ZodPipe(schema)) body: z.infer<typeof schema>) { return this.svc.saveMine(u, body); }

  @Roles("DOCTOR") @Get("appointments/:id/health-profile")
  forAppointment(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) { return this.svc.forAppointment(u, id); }
}
