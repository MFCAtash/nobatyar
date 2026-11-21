import { randomUUID } from "node:crypto";
import { ConflictException, HttpException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../common/decorators";
import { aad, FIELD_CRYPTO, FieldCrypto } from "../crypto";
import { NotificationService } from "../notifications/notification.service";
import { PrismaService } from "../prisma/prisma.service";
import { normalizeSoap, planAddendum, planSoapEdit, SoapContent, SoapDraftInput, SoapWriteError, validateForSigning, diagnosisErrors, SOAP_LIMITS } from "./soap-policy";

export const SOAP_EDIT_WINDOW_DAYS = (() => {
  const n = Number(process.env.SOAP_EDIT_WINDOW_DAYS ?? 7);
  return Number.isInteger(n) && n >= 1 && n <= 60 ? n : 7;
})();

const apptSel = { id: true, doctorId: true, patientId: true, status: true, endsAt: true, soapNote: { select: { id: true, status: true, version: true } } } as const;

@Injectable()
export class SoapService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  private deny(e: SoapWriteError): HttpException {
    switch (e) {
      case "not_participant": return new NotFoundException();
      case "invalid_state": return new ConflictException({ error: "invalid_state" });
      case "window_closed": return new UnprocessableEntityException({ error: "window_closed" });
      case "already_signed": return new ConflictException({ error: "already_signed" });
      case "not_signed": return new ConflictException({ error: "not_signed" });
    }
  }

  private async load(tx: Prisma.TransactionClient, u: AuthUser, id: string) {
    const a = await tx.appointment.findUnique({ where: { id }, select: apptSel });
    if (!a || a.doctorId !== u.id) throw new NotFoundException(); // فقط پزشک همین نوبت؛ وجود نوبت لو نرود
    return a;
  }
  private facts(a: Awaited<ReturnType<SoapService["load"]>>, u: AuthUser) {
    return { appointmentStatus: a.status, endsAt: a.endsAt, userId: u.id, doctorId: a.doctorId, existing: a.soapNote ? { status: a.soapNote.status } : null };
  }

  /** یادداشت پزشک (S/O/A/P + پیش‌نویس خلاصه + الحاقیه‌ها). */
  async getForDoctor(u: AuthUser, appointmentId: string) {
    return this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      const a = await this.load(tx, u, appointmentId);
      const n = await tx.soapNote.findUnique({ where: { appointmentId }, include: { addenda: { orderBy: { createdAt: "asc" } } } });
      if (!n) return { exists: false as const, appointmentStatus: a.status };
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "soap.read", objectType: "appointment", objectId: appointmentId });
      return {
        exists: true as const, appointmentStatus: a.status, status: n.status, version: n.version, signedAt: n.signedAt, updatedAt: n.updatedAt,
        content: JSON.parse(this.crypto.decryptString(n.contentEnc, aad("soap_notes", n.id, "content"))) as SoapContent,
        patientSummary: n.patientSummaryEnc ? this.crypto.decryptString(n.patientSummaryEnc, aad("soap_notes", n.id, "patient_summary")) : "",
        addenda: n.addenda.map((x) => ({ id: x.id, createdAt: x.createdAt, body: this.crypto.decryptString(x.bodyEnc, aad("soap_addenda", x.id, "body")) })),
      };
    });
  }

  async saveDraft(u: AuthUser, appointmentId: string, input: SoapDraftInput, expectedVersion?: number, now = new Date()) {
    const { content, patientSummary } = normalizeSoap(input);
    const de = diagnosisErrors(content);
    if (de.length) throw new UnprocessableEntityException({ error: "soap_invalid", issues: de });
    return this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      const a = await this.load(tx, u, appointmentId);
      const plan = planSoapEdit(this.facts(a, u), now, { editWindowDays: SOAP_EDIT_WINDOW_DAYS });
      if (!plan.ok) throw this.deny(plan.error);

      if (!a.soapNote) {
        const id = randomUUID();
        await tx.soapNote.create({
          data: {
            id, appointmentId, doctorId: u.id, patientId: a.patientId,
            contentEnc: this.crypto.encrypt(JSON.stringify(content), aad("soap_notes", id, "content")),
            patientSummaryEnc: patientSummary ? this.crypto.encrypt(patientSummary, aad("soap_notes", id, "patient_summary")) : null,
          },
        });
        await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "soap.create", objectType: "appointment", objectId: appointmentId });
        return { status: "DRAFT" as const, version: 1 };
      }
      const n = a.soapNote;
      if (expectedVersion !== undefined && expectedVersion !== n.version) throw new ConflictException({ error: "concurrent_modification" });
      const upd = await tx.soapNote.updateMany({
        where: { id: n.id, status: "DRAFT", version: n.version },
        data: {
          version: n.version + 1,
          contentEnc: this.crypto.encrypt(JSON.stringify(content), aad("soap_notes", n.id, "content")),
          patientSummaryEnc: patientSummary ? this.crypto.encrypt(patientSummary, aad("soap_notes", n.id, "patient_summary")) : null,
        },
      });
      if (upd.count !== 1) throw new ConflictException({ error: "concurrent_modification" });
      return { status: "DRAFT" as const, version: n.version + 1 };
    });
  }

  /** امضا: SOAP تغییرناپذیر می‌شود و «خلاصه‌ی ویزیت» (اگر نوشته شده) برای بیمار منتشر می‌شود. */
  async sign(u: AuthUser, appointmentId: string, now = new Date()) {
    const out = await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      const a = await this.load(tx, u, appointmentId);
      const plan = planSoapEdit(this.facts(a, u), now, { editWindowDays: SOAP_EDIT_WINDOW_DAYS });
      if (!plan.ok) throw this.deny(plan.error);
      if (!a.soapNote) throw new UnprocessableEntityException({ error: "soap_invalid", issues: ["nothing_to_sign"] });
      const n = await tx.soapNote.findUniqueOrThrow({ where: { id: a.soapNote.id } });
      const content = JSON.parse(this.crypto.decryptString(n.contentEnc, aad("soap_notes", n.id, "content"))) as SoapContent;
      const issues = validateForSigning(content);
      if (issues.length) throw new UnprocessableEntityException({ error: "soap_invalid", issues });

      const upd = await tx.soapNote.updateMany({ where: { id: n.id, status: "DRAFT", version: n.version }, data: { status: "SIGNED", signedAt: now, version: n.version + 1 } });
      if (upd.count !== 1) throw new ConflictException({ error: "concurrent_modification" });

      const text = n.patientSummaryEnc ? this.crypto.decryptString(n.patientSummaryEnc, aad("soap_notes", n.id, "patient_summary")) : "";
      let published = false;
      if (text) {
        const vid = randomUUID();
        await tx.visitSummary.create({
          data: {
            id: vid, appointmentId, doctorId: u.id, patientId: a.patientId, publishedAt: now,
            summaryEnc: this.crypto.encrypt(JSON.stringify({ text, followUpDays: content.followUpDays }), aad("visit_summaries", vid, "summary")),
          },
        });
        published = true;
      }
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "soap.sign", objectType: "appointment", objectId: appointmentId, meta: { summaryPublished: published } });
      return { published, patientId: a.patientId };
    });
    if (out.published) {
      await this.notifications.push(out.patientId, {
        kind: "VISIT_SUMMARY_READY", titleFa: "خلاصه‌ی ویزیت شما آماده است", bodyFa: "پزشک خلاصه‌ی ویزیت را ثبت کرد.", payload: { appointmentId },
      });
    }
    return { status: "SIGNED" as const, summaryPublished: out.published };
  }

  async addAddendum(u: AuthUser, appointmentId: string, body: string) {
    const text = body.trim().slice(0, SOAP_LIMITS.addendum);
    if (!text) throw new UnprocessableEntityException({ error: "soap_invalid", issues: ["addendum_empty"] });
    return this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      const a = await this.load(tx, u, appointmentId);
      const plan = planAddendum(this.facts(a, u));
      if (!plan.ok) throw this.deny(plan.error);
      const id = randomUUID();
      const r = await tx.soapAddendum.create({
        data: { id, noteId: a.soapNote!.id, doctorId: u.id, bodyEnc: this.crypto.encrypt(text, aad("soap_addenda", id, "body")) },
        select: { id: true, createdAt: true },
      });
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "soap.addendum", objectType: "appointment", objectId: appointmentId });
      return r;
    });
  }

  /** خلاصه‌ی ویزیت: بیمار و پزشک همان نوبت (RLS vs_read). */
  async visitSummary(u: AuthUser, appointmentId: string) {
    const v = await this.prisma.withContext({ role: u.role, userId: u.id }, (tx) =>
      tx.visitSummary.findUnique({ where: { appointmentId }, select: { id: true, publishedAt: true, summaryEnc: true, doctor: { select: { fullName: true } } } }),
    );
    if (!v) throw new NotFoundException();
    const s = JSON.parse(this.crypto.decryptString(v.summaryEnc, aad("visit_summaries", v.id, "summary"))) as { text: string; followUpDays: number | null };
    return { text: s.text, followUpDays: s.followUpDays, publishedAt: v.publishedAt, doctorName: v.doctor.fullName };
  }
}
