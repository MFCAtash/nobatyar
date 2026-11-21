import { createHash } from "node:crypto";
import { Body, Controller, Get, Header, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, Res } from "@nestjs/common";
import { z } from "zod";
import type { Response } from "express";
import { AuthUser, CurrentUser, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { FhirService } from "./fhir.service";

export const dataRequestSchema = z.object({ type: z.enum(["EXPORT", "DELETE"]) }).strict();

@Controller("me")
export class FhirController {
  constructor(@Inject(FhirService) private readonly svc: FhirService) {}

  /** پرونده سلامت قابل حمل: FHIR R4 Bundle (IPS-scoped). پاسخ قابل cache نشود. */
  @Roles("PATIENT")
  @Get("health-record/fhir")
  @Header("Cache-Control", "no-store")
  @Header("Content-Type", "application/fhir+json; charset=utf-8")
  async fhir(@CurrentUser() u: AuthUser, @Query("includeDocuments") includeDocuments?: string, @Res() res?: Response) {
    const bundle = await this.svc.exportForPatient(u, new Date(), false, includeDocuments === "true");
    const etag = `W/"${createHash("sha256").update(JSON.stringify(bundle)).digest("hex").slice(0, 24)}"`;
    res?.setHeader("ETag", etag);
    return res ? res.json(bundle) : bundle;
  }

  @Post("data-requests")
  @HttpCode(202)
  request(@CurrentUser() u: AuthUser, @Body(new ZodPipe(dataRequestSchema)) b: z.infer<typeof dataRequestSchema>) {
    return this.svc.request(u, b.type);
  }

  @Get("data-requests")
  requests(@CurrentUser() u: AuthUser) {
    return this.svc.listRequests(u);
  }

  @Get("data-requests/:id/download")
  download(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.downloadUrl(u, id);
  }

  @Post("data-requests/:id/cancel")
  @HttpCode(200)
  cancel(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.cancelRequest(u, id);
  }
}
