import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { AuthUser, CurrentUser, RequireConsent, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { VitalsService } from "./vitals.service";

const vitalType = z.enum(["BLOOD_PRESSURE", "BLOOD_GLUCOSE", "WEIGHT", "HEART_RATE", "BODY_TEMPERATURE", "OXYGEN_SATURATION"]);

export const createSchema = z.object({
  type: vitalType,
  valuePrimary: z.number().finite(),
  valueSecondary: z.number().finite().nullable().optional(),
  measuredAt: z.string().datetime({ offset: true }),
  source: z.enum(["MANUAL", "DEVICE"]).default("MANUAL"),
  note: z.string().trim().max(500).optional(),
}).strict();

export const listSchema = z.object({
  type: vitalType.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().uuid().optional(),
});

@Controller("vitals")
export class VitalsController {
  constructor(@Inject(VitalsService) private readonly svc: VitalsService) {}

  /** ثبت اندازهگیری: رضایت پردازش داده سلامت الزامی است. */
  @Roles("PATIENT")
  @RequireConsent("HEALTH_DATA_PROCESSING")
  @Post()
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(createSchema)) b: z.infer<typeof createSchema>) {
    return this.svc.create(u, b);
  }

  @Get()
  list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(listSchema)) q: z.infer<typeof listSchema>) {
    return this.svc.list(u, q);
  }

  @Delete(":id")
  @HttpCode(200)
  remove(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.remove(u, id);
  }
}
