import { Body, Controller, HttpCode, Inject, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { AuthUser, CurrentUser, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { RescheduleService } from "./reschedule.service";
import { rescheduleSchema, type RescheduleInput } from "./schemas";

@Controller("appointments")
export class RescheduleController {
  constructor(@Inject(RescheduleService) private readonly svc: RescheduleService) {}

  /** جابهجایی نوبت: پرداخت و وضعیت دستنخورده میماند؛ فقط اسلات توسط تریگر busy synchron میشود. */
  @Roles("PATIENT", "DOCTOR")
  @HttpCode(200)
  @Post(":id/reschedule")
  reschedule(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string, @Body(new ZodPipe(rescheduleSchema)) b: RescheduleInput) {
    return this.svc.reschedule(u, id, b.startsAt);
  }
}
