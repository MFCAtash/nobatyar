import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { z } from "zod";
import { AuthUser, CurrentUser, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { ScribeService } from "./scribe.service";

export const transcriptSchema = z.object({ transcript: z.string().trim().min(20).max(30_000) }).strict();
/** A5: نسخهٔ SOAP که پیشنویس بر اساس آن بارگذاری شده است. */
export const applySchema = z.object({ expectedVersion: z.number().int().min(1).optional() }).strict();

/** تمام مسیرها فقط پزشک همان نوبتاند؛ رضایت دوطرفه در سرویس بررسی میشود. */
@Roles("DOCTOR")
@Controller("appointments/:id/scribe")
export class ScribeController {
  constructor(@Inject(ScribeService) private readonly svc: ScribeService) {}

  @Get()
  draft(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.getDraft(u, id);
  }

  @Get("consents")
  consents(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.consentStatus(u, id);
  }

  @Post("start")
  @HttpCode(200)
  start(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.start(u, id);
  }

  @Post("transcript")
  @HttpCode(200)
  transcript(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string, @Body(new ZodPipe(transcriptSchema)) b: z.infer<typeof transcriptSchema>) {
    return this.svc.uploadTranscript(u, id, b.transcript);
  }

  @Post("draft")
  @HttpCode(200)
  generate(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.generateDraft(u, id);
  }

  @Post("apply")
  @HttpCode(200)
  apply(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string, @Body(new ZodPipe(applySchema)) b: z.infer<typeof applySchema>) {
    return this.svc.applyToSoap(u, id, b.expectedVersion);
  }

  @Delete()
  @HttpCode(200)
  discard(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.discard(u, id);
  }
}
