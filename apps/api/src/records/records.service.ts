import { randomUUID } from "node:crypto";
import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import type { Prisma, RecordCategory } from "@prisma/client";
import { z } from "zod";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../common/decorators";
import { aad, FIELD_CRYPTO, FieldCrypto } from "../crypto";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { isOwnRecordObjectKey, resolveShareExpiry } from "./records-policy";

export { AddAttachmentSchema, CreateRecordSchema, ShareSchema, UpdateRecordSchema } from "./records.schemas";
export type { CreateRecordInput } from "./records.schemas";
import type { AddAttachmentSchema, CreateRecordSchema, CreateRecordInput, ShareSchema } from "./records.schemas";

const PAGE = 20;
const listSelect = {
  id: true, title: true, category: true, visitDate: true, tags: true, createdAt: true, updatedAt: true,
  _count: { select: { attachments: true } },
} satisfies Prisma.HealthRecordSelect;

/**
 * پرونده‌ی سلامت. همه‌ی دسترسی‌ها با withContext (RLS):
 *  - بیمار: فقط پرونده‌های خودش؛ پزشک: فقط با اشتراک فعال و بدون ابطال/انقضا (سیاست health_records_read).
 *  - هر خواندن محتوا/پیوست توسط «غیرمالک» در Audit ثبت می‌شود.
 */
@Injectable()
export class RecordsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private ctx(u: AuthUser) { return { role: u.role, userId: u.id } as const; }

  async list(u: AuthUser, o: { category?: RecordCategory; cursor?: string }) {
    const isDoctor = u.role === "DOCTOR";
    const rows = await this.prisma.withContext(this.ctx(u), (tx) =>
      tx.healthRecord.findMany({
        where: {
          ...(o.category ? { category: o.category } : {}),
          ...(isDoctor ? { shares: { some: { doctorId: u.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } } } : { patientId: u.id }),
        },
        select: { ...listSelect, ...(isDoctor ? { patient: { select: { userId: true, fullName: true } } } : {}) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: PAGE + 1,
        ...(o.cursor ? { cursor: { id: o.cursor }, skip: 1 } : {}),
      }),
    );
    const page = rows.slice(0, PAGE);
    return {
      records: page.map(({ _count, ...r }) => ({ ...r, attachmentCount: _count.attachments })),
      hasMore: rows.length > PAGE,
      cursor: rows.length > PAGE ? page[page.length - 1].id : null,
    };
  }

  async getOne(u: AuthUser, id: string) {
    const rec = await this.prisma.withContext(this.ctx(u), async (tx) => {
      const r = await tx.healthRecord.findUnique({
        where: { id },
        include: {
          attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true } },
          shares: { where: { revokedAt: null }, select: { id: true, doctorId: true, grantedAt: true, expiresAt: true, doctor: { select: { fullName: true } } } },
        },
      });
      if (!r) return null;
      if (r.patientId !== u.id) await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "record.read", objectType: "health_record", objectId: id });
      return r;
    });
    if (!rec) throw new NotFoundException(); // RLS: رکورد دیگران دیده نمی‌شود
    const isOwner = rec.patientId === u.id;
    return {
      id: rec.id, title: rec.title, category: rec.category, visitDate: rec.visitDate, tags: rec.tags,
      content: this.crypto.decryptString(rec.contentEnc, aad("health_records", id, "content")),
      createdAt: rec.createdAt, updatedAt: rec.updatedAt, attachments: rec.attachments,
      // فهرست اشتراک‌ها فقط برای مالک (پزشک نباید ببیند با چه کسان دیگری به اشتراک است)
      shares: isOwner ? rec.shares.map((s) => ({ id: s.id, doctorId: s.doctorId, grantedAt: s.grantedAt, expiresAt: s.expiresAt, doctor: s.doctor })) : [],
    };
  }

  async create(u: AuthUser, dto: CreateRecordInput) {
    const id = randomUUID();
    return this.prisma.withContext(this.ctx(u), async (tx) => {
      const rec = await tx.healthRecord.create({
        data: {
          id, patientId: u.id, title: dto.title, category: dto.category as RecordCategory, tags: dto.tags,
          visitDate: dto.visitDate ? new Date(dto.visitDate) : undefined,
          contentEnc: this.crypto.encrypt(dto.content, aad("health_records", id, "content")),
        },
        select: { id: true, title: true, category: true, visitDate: true, tags: true, createdAt: true },
      });
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "record.create", objectType: "health_record", objectId: id, meta: { category: dto.category } });
      return rec;
    });
  }

  async update(u: AuthUser, id: string, dto: Partial<CreateRecordInput>) {
    return this.prisma.withContext(this.ctx(u), async (tx) => {
      const data: Prisma.HealthRecordUpdateInput = {};
      if (dto.title !== undefined) data.title = dto.title;
      if (dto.category !== undefined) data.category = dto.category as RecordCategory;
      if (dto.visitDate !== undefined) data.visitDate = new Date(dto.visitDate);
      if (dto.tags !== undefined) data.tags = dto.tags;
      if (dto.content !== undefined) data.contentEnc = this.crypto.encrypt(dto.content, aad("health_records", id, "content"));
      // RLS (health_records_write) فقط مالک را می‌گذراند ⇒ برای دیگران count=0
      const r = await tx.healthRecord.updateMany({ where: { id, patientId: u.id }, data });
      if (r.count !== 1) throw new NotFoundException();
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "record.update", objectType: "health_record", objectId: id });
      return tx.healthRecord.findUniqueOrThrow({ where: { id }, select: { id: true, title: true, category: true, visitDate: true, tags: true, updatedAt: true } });
    });
  }

  async remove(u: AuthUser, id: string) {
    const keys = await this.prisma.withContext(this.ctx(u), async (tx) => {
      const r = await tx.healthRecord.findFirst({ where: { id, patientId: u.id }, select: { attachments: { select: { objectKey: true } } } });
      if (!r) throw new NotFoundException();
      await tx.healthRecord.delete({ where: { id } });
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "record.delete", objectType: "health_record", objectId: id });
      return r.attachments.map((a) => a.objectKey);
    });
    await Promise.all(keys.map((k) => this.storage.deleteObject("records", k))); // پس از commit؛ شکست فقط لاگ می‌شود
    return { deleted: true };
  }

  async addAttachment(u: AuthUser, recordId: string, dto: z.infer<typeof AddAttachmentSchema>) {
    if (!isOwnRecordObjectKey(u.id, dto.objectKey)) throw new ForbiddenException({ error: "invalid_object_key" });
    const head = await this.storage.headObject("records", dto.objectKey);
    if (!head) throw new UnprocessableEntityException({ error: "upload_missing" });
    return this.prisma.withContext(this.ctx(u), async (tx) => {
      const own = await tx.healthRecord.findFirst({ where: { id: recordId, patientId: u.id }, select: { id: true } });
      if (!own) throw new NotFoundException();
      const dup = await tx.recordAttachment.findFirst({ where: { objectKey: dto.objectKey }, select: { id: true } });
      if (dup) throw new ConflictException({ error: "attachment_exists" });
      return tx.recordAttachment.create({
        data: { recordId, objectKey: dto.objectKey, fileName: dto.fileName, mimeType: head.mime, sizeBytes: head.size || dto.sizeBytes },
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true },
      });
    });
  }

  async getAttachmentUrl(u: AuthUser, attachmentId: string) {
    const att = await this.prisma.withContext(this.ctx(u), async (tx) => {
      // RLS (record_attachments_read ⇒ health_records_read) تضمین می‌کند فقط مالک یا پزشکِ دارای اشتراک فعال می‌بیند
      const a = await tx.recordAttachment.findUnique({ where: { id: attachmentId }, select: { objectKey: true, fileName: true, recordId: true, record: { select: { patientId: true } } } });
      if (a && a.record.patientId !== u.id) {
        await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "record.attachment_download", objectType: "health_record", objectId: a.recordId });
      }
      return a;
    });
    if (!att) throw new NotFoundException();
    return this.storage.createDownloadUrl("records", att.objectKey, att.fileName);
  }

  async share(u: AuthUser, recordId: string, dto: z.infer<typeof ShareSchema>, now = new Date()) {
    const exp = resolveShareExpiry(now, dto.expiresAt ? new Date(dto.expiresAt) : undefined);
    if (!exp.ok) throw new UnprocessableEntityException({ error: exp.error });
    return this.prisma.withContext(this.ctx(u), async (tx) => {
      const own = await tx.healthRecord.findFirst({ where: { id: recordId, patientId: u.id }, select: { id: true } });
      if (!own) throw new NotFoundException();
      const doc = await tx.doctorProfile.findFirst({ where: { userId: dto.doctorId, isListed: true }, select: { userId: true } });
      if (!doc) throw new NotFoundException({ error: "doctor_not_found" });
      const s = await tx.recordShare.upsert({
        where: { recordId_doctorId: { recordId, doctorId: dto.doctorId } },
        update: { revokedAt: null, expiresAt: exp.expiresAt, grantedAt: now },
        create: { recordId, doctorId: dto.doctorId, expiresAt: exp.expiresAt },
        select: { id: true, doctorId: true, grantedAt: true, expiresAt: true },
      });
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "record.share", objectType: "health_record", objectId: recordId, meta: { doctorId: dto.doctorId } });
      return s;
    });
  }

  async revokeShare(u: AuthUser, recordId: string, shareId: string) {
    return this.prisma.withContext(this.ctx(u), async (tx) => {
      const r = await tx.recordShare.updateMany({ where: { id: shareId, recordId, revokedAt: null, record: { patientId: u.id } }, data: { revokedAt: new Date() } });
      if (r.count !== 1) throw new NotFoundException();
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "record.share_revoke", objectType: "health_record", objectId: recordId });
      return { revoked: true };
    });
  }
}
