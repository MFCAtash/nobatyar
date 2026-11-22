import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import type { AuthUser } from "../common/decorators";
import { CurrentUser, RequireConsent, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { PatientRecordService } from "./patient-record.service";
import {
  addTimelineSchema,
  exportSchema,
  reconcileSchema,
  timelineQuerySchema,
  type AddTimelineInput,
  type ExportInput,
  type ReconcileInput,
} from "./patient-record.schemas";

@Controller("me")
@Roles("PATIENT")
export class PatientRecordController {
  constructor(private readonly svc: PatientRecordService) {}

  @Get("health/timeline")
  timeline(@CurrentUser() user: AuthUser, @Query(new ZodPipe(timelineQuerySchema)) q: { kind?: "WEIGHT" | "BP" | "GLUCOSE" | "LAB"; from?: string; to?: string }) {
    return this.svc.timeline(user, q);
  }

  @Post("health/timeline")
  @RequireConsent("HEALTH_DATA_PROCESSING")
  add(@CurrentUser() user: AuthUser, @Body(new ZodPipe(addTimelineSchema)) body: AddTimelineInput) {
    return this.svc.addPoint(user, body);
  }

  @Get("health/medications")
  medications(@CurrentUser() user: AuthUser) {
    return this.svc.latestMedications(user);
  }

  @Post("health/medications/reconcile")
  @RequireConsent("HEALTH_DATA_PROCESSING")
  reconcile(@CurrentUser() user: AuthUser, @Body(new ZodPipe(reconcileSchema)) body: ReconcileInput) {
    return this.svc.reconcileMedications(user, body);
  }

  @Get("consent-ledger")
  ledger(@CurrentUser() user: AuthUser) {
    return this.svc.consentLedger(user);
  }

  @Post("health/export")
  @RequireConsent("HEALTH_DATA_PROCESSING")
  export(@CurrentUser() user: AuthUser, @Body(new ZodPipe(exportSchema)) body: ExportInput) {
    return this.svc.exportRecord(user, body.passphrase);
  }
}
