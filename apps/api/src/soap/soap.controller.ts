import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { z } from "zod";
import { AuthUser, CurrentUser, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { SOAP_LIMITS } from "./soap-policy";
import { SoapService } from "./soap.service";

const sec = z.string().max(SOAP_LIMITS.section).optional();
const draftSchema = z.object({
  subjective: sec, objective: sec, assessment: sec, plan: sec,
  diagnoses: z.array(z.object({ code: z.string().max(12).optional(), text: z.string().max(SOAP_LIMITS.diagnosisText) }).strict()).max(SOAP_LIMITS.diagnoses).optional(),
  followUpDays: z.number().int().min(1).max(SOAP_LIMITS.followUpDaysMax).nullable().optional(),
  patientSummary: z.string().max(SOAP_LIMITS.summary).optional(),
  expectedVersion: z.number().int().min(1).optional(),
}).strict();
const addendumSchema = z.object({ body: z.string().trim().min(1).max(SOAP_LIMITS.addendum) }).strict();
type Draft = z.infer<typeof draftSchema>;

@Controller("appointments/:id")
export class SoapController {
  constructor(@Inject(SoapService) private readonly svc: SoapService) {}

  @Roles("DOCTOR") @Get("soap")
  get(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) { return this.svc.getForDoctor(u, id); }

  @Roles("DOCTOR") @Put("soap")
  save(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string, @Body(new ZodPipe(draftSchema)) b: Draft) {
    const { expectedVersion, ...rest } = b;
    return this.svc.saveDraft(u, id, rest, expectedVersion);
  }

  @Roles("DOCTOR") @HttpCode(200) @Post("soap/sign")
  sign(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) { return this.svc.sign(u, id); }

  @Roles("DOCTOR") @Post("soap/addenda")
  addendum(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string, @Body(new ZodPipe(addendumSchema)) b: z.infer<typeof addendumSchema>) {
    return this.svc.addAddendum(u, id, b.body);
  }

  @Roles("PATIENT", "DOCTOR") @Get("visit-summary")
  summary(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) { return this.svc.visitSummary(u, id); }
}
