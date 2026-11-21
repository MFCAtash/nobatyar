import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { AuthUser, ClientIp, CurrentUser, Public, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { RX_FORMS, RX_LIMITS } from "./prescription-policy";
import { PrescriptionService } from "./prescription.service";

const L = RX_LIMITS;
const itemSchema = z.object({
  drugName: z.string().trim().min(2).max(L.drugName),
  form: z.enum(RX_FORMS).optional(),
  strength: z.string().trim().max(L.strength).optional(),
  dose: z.string().trim().min(1).max(L.dose),
  frequency: z.string().trim().min(1).max(L.frequency),
  durationDays: z.number().int().min(1).max(L.durationDaysMax),
  quantity: z.number().int().min(1).max(L.quantityMax),
  instructions: z.string().trim().max(L.instructions).optional(),
}).strict();
const issueSchema = z.object({
  items: z.array(itemSchema).min(1).max(L.items),
  validDays: z.number().int().min(1).max(90).optional(),
  acknowledgeWarnings: z.boolean().optional(),
}).strict();
const cancelSchema = z.object({ reason: z.string().trim().min(L.cancelReasonMin).max(L.cancelReasonMax) }).strict();
const verifySchema = z.object({ number: z.string().max(20), code: z.string().max(16) });

@Controller()
export class PrescriptionController {
  constructor(@Inject(PrescriptionService) private readonly svc: PrescriptionService) {}

  @Roles("DOCTOR") @Post("appointments/:id/prescriptions")
  issue(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string, @Body(new ZodPipe(issueSchema)) b: z.infer<typeof issueSchema>) {
    return this.svc.issue(u, id, b);
  }

  @Roles("PATIENT", "DOCTOR") @Get("appointments/:id/prescriptions")
  forAppointment(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) { return this.svc.listForAppointment(u, id); }

  @Roles("PATIENT", "DOCTOR") @Get("prescriptions")
  mine(@CurrentUser() u: AuthUser) { return this.svc.listMine(u); }

  /** عمومی (داروخانه)؛ باید قبل از :id تعریف شود. */
  @Public() @Get("prescriptions/verify")
  verify(@ClientIp() ip: string, @Query(new ZodPipe(verifySchema)) q: z.infer<typeof verifySchema>) { return this.svc.publicVerify(q.number, q.code, ip); }

  @Roles("PATIENT", "DOCTOR") @Get("prescriptions/:id")
  one(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) { return this.svc.getOne(u, id); }

  @Roles("DOCTOR") @HttpCode(200) @Post("prescriptions/:id/cancel")
  cancel(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string, @Body(new ZodPipe(cancelSchema)) b: z.infer<typeof cancelSchema>) {
    return this.svc.cancel(u, id, b.reason);
  }
}
