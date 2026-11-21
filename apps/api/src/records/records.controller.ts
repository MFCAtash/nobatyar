import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import type { RecordCategory } from "@prisma/client";
import { z } from "zod";
import { AuthUser, CurrentUser, RequireConsent, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import {
  AddAttachmentSchema, CreateRecordInput, CreateRecordSchema, RecordsService, ShareSchema, UpdateRecordSchema,
} from "./records.service";

const listQuery = z.object({
  category: z.enum(["NOTE", "LAB_RESULT", "IMAGING", "PRESCRIPTION", "DISCHARGE_SUMMARY", "REFERRAL", "VACCINATION", "OTHER"]).optional(),
  cursor: z.string().uuid().optional(),
});

@Controller("records")
export class RecordsController {
  constructor(@Inject(RecordsService) private readonly svc: RecordsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(listQuery)) q: { category?: RecordCategory; cursor?: string }) {
    return this.svc.list(u, q);
  }

  @Roles("PATIENT", "DOCTOR")
  @Get("attachments/:attId/download")
  downloadUrl(@CurrentUser() u: AuthUser, @Param("attId", new ParseUUIDPipe()) attId: string) {
    return this.svc.getAttachmentUrl(u, attId);
  }

  @Roles("PATIENT", "DOCTOR")
  @Get(":id")
  getOne(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.getOne(u, id);
  }

  @Roles("PATIENT") @RequireConsent("HEALTH_DATA_PROCESSING")
  @Post()
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(CreateRecordSchema)) dto: CreateRecordInput) {
    return this.svc.create(u, dto);
  }

  @Roles("PATIENT") @RequireConsent("HEALTH_DATA_PROCESSING")
  @Patch(":id")
  update(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string, @Body(new ZodPipe(UpdateRecordSchema)) dto: Partial<CreateRecordInput>) {
    return this.svc.update(u, id, dto);
  }

  @Roles("PATIENT")
  @Delete(":id")
  remove(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.remove(u, id);
  }

  @Roles("PATIENT") @RequireConsent("HEALTH_DATA_PROCESSING")
  @Post(":id/attachments")
  addAttachment(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string, @Body(new ZodPipe(AddAttachmentSchema)) dto: z.infer<typeof AddAttachmentSchema>) {
    return this.svc.addAttachment(u, id, dto);
  }

  @Roles("PATIENT") @RequireConsent("HEALTH_DATA_PROCESSING")
  @Post(":id/shares")
  share(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string, @Body(new ZodPipe(ShareSchema)) dto: z.infer<typeof ShareSchema>) {
    return this.svc.share(u, id, dto);
  }

  @Roles("PATIENT") @HttpCode(200)
  @Delete(":id/shares/:shareId")
  revokeShare(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string, @Param("shareId", new ParseUUIDPipe()) shareId: string) {
    return this.svc.revokeShare(u, id, shareId);
  }
}
