import { randomUUID } from "node:crypto";
import { ConflictException, HttpException, Inject, Injectable, Logger, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../common/decorators";
import { aad, FIELD_CRYPTO, FieldCrypto } from "../crypto";
import { NotificationService } from "../notifications/notification.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  DEFAULT_SO_CONFIG, planSoAction, planSoRequest, SO_ACTOR, SO_REVOKES_SHARES, SoAction, SoRequestError, SoStatus,
} from "./second-opinion-policy";

export interface RequestInput {
  appointmentId: string; doctorId: string; question: string; caseSummary: string; ageYears?: number; gender?: "MALE" | "FEMALE";
  recordIds: string[]; includeVisitSummary: boolean;
}
export interface AnswerInput { opinion: string; recommendations?: string; needsInPerson: boolean; urgency?: "ROUTINE" | "SOON" | "URGENT" }
export type Actor = { kind: "user"; user: AuthUser } | { kind: "system" };

const REQ_ERR: Record<SoRequestError, [number, string]> = {
  not_owner: [404, "not_found"], appointment_not_completed: [409, "appointment_not_completed"], request_window_passed: [422, "request_window_passed"],
  target_unavailable: [404, "doctor_not_found"], same_doctor: [422, "same_doctor"], too_many_open: [409, "too_many_open"],
  too_many_for_appointment: [409, "too_many_for_appointment"], duplicate_request: [409, "duplicate_request"], too_many_records: [422, "too_many_records"],
};

@Injectable()
export class SecondOpinionService {
  private readonly log = new Logger(SecondOpinionService.name);
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  // ───────────── پزشک: پذیرش درخواست نظر دوم ─────────────
  async getSettings(u: AuthUser) {
    const d = await this.prisma.withContext({ role: u.role, userId: u.id }, (tx) => tx.doctorProfile.findUnique({ where: { userId: u.id }, select: { acceptsSecondOpinions: true } }));
    return { accepts: d?.acceptsSecondOpinions ?? false };
  }
  async setSettings(u: AuthUser, accepts: boolean) {
    await this.prisma.withContext({ role: u.role, userId: u.id }, (tx) => tx.doctorProfile.update({ where: { userId: u.id }, data: { acceptsSecondOpinions: accepts } }));
    return { accepts };
  }

  // ───────────── بیمار: فهرست پزشکان مناسب ─────────────
  async candidates(u: AuthUser, appointmentId: string) {
    return this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      const a = await tx.appointment.findFirst({ where: { id: appointmentId, patientId: u.id, status: "COMPLETED" }, select: { doctorId: true, doctor: { select: { specialties: { select: { specialtyId: true } } } } } });
      if (!a) throw new NotFoundException();
      const mine = new Set(a.doctor.specialties.map((s) => s.specialtyId));
      const rows = await tx.doctorProfile.findMany({
        where: { isListed: true, acceptsSecondOpinions: true, userId: { notIn: [a.doctorId, u.id] } },
        select: { userId: true, fullName: true, bio: true, specialties: { select: { specialtyId: true, specialty: { select: { slug: true, nameFa: true } } } } },
        take: 50,
      });
      return rows
        .map((d) => ({ id: d.userId, fullName: d.fullName, bio: d.bio, specialties: d.specialties.map((s) => s.specialty), sameSpecialty: d.specialties.some((s) => mine.has(s.specialtyId)) }))
        .sort((x, y) => Number(y.sameSpecialty) - Number(x.sameSpecialty));
    });
  }

  // ───────────── بیمار: ثبت درخواست ─────────────
  async request(u: AuthUser, dto: RequestInput, now = new Date()) {
    const out = await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      const a = await tx.appointment.findUnique({ where: { id: dto.appointmentId }, select: { status: true, patientId: true, doctorId: true, endsAt: true } });
      if (!a) throw new NotFoundException();
      const target = await tx.doctorProfile.findUnique({ where: { userId: dto.doctorId }, select: { userId: true, isListed: true, acceptsSecondOpinions: true } });
      const open = ["REQUESTED", "ACCEPTED"] as SoStatus[];
      const [openCountForPatient, countForAppointment, dup] = await Promise.all([
        tx.secondOpinion.count({ where: { patientId: u.id, status: { in: open } } }),
        tx.secondOpinion.count({ where: { appointmentId: dto.appointmentId, patientId: u.id, status: { notIn: ["CANCELLED"] } } }),
        tx.secondOpinion.count({ where: { appointmentId: dto.appointmentId, patientId: u.id, doctorId: dto.doctorId, status: { in: open } } }),
      ]);
      const plan = planSoRequest({
        appointment: a, requesterId: u.id, target: target ? { id: target.userId, isListed: target.isListed, acceptsSecondOpinions: target.acceptsSecondOpinions } : null,
        openCountForPatient, countForAppointment, duplicateOpenToSameDoctor: dup > 0, recordCount: dto.recordIds.length,
      }, now, DEFAULT_SO_CONFIG);
      if (!plan.ok) { const [status, error] = REQ_ERR[plan.error]; throw new HttpException({ error }, status); }

      const recordIds = [...new Set(dto.recordIds)];
      if (recordIds.length) {
        const owned = await tx.healthRecord.count({ where: { id: { in: recordIds }, patientId: u.id } });
        if (owned !== recordIds.length) throw new UnprocessableEntityException({ error: "invalid_records" });
      }
      if (dto.includeVisitSummary && !(await tx.visitSummary.findUnique({ where: { appointmentId: dto.appointmentId }, select: { id: true } }))) {
        throw new UnprocessableEntityException({ error: "no_visit_summary" });
      }

      const id = randomUUID();
      // پزشک دوم هویت بیمار را نمی‌بیند: فقط همین payload که بیمار خودش نوشته
      const request = { question: dto.question, caseSummary: dto.caseSummary, ageYears: dto.ageYears ?? null, gender: dto.gender ?? null };
      await tx.secondOpinion.create({
        data: {
          id, appointmentId: dto.appointmentId, patientId: u.id, doctorId: dto.doctorId, includeVisitSummary: dto.includeVisitSummary, sharedRecordIds: recordIds,
          acceptDeadlineAt: plan.acceptDeadlineAt, sharesExpireAt: plan.sharesExpireAt,
          requestEnc: this.crypto.encrypt(JSON.stringify(request), aad("second_opinions", id, "request")),
        },
      });
      for (const recordId of recordIds) {
        await tx.recordShare.upsert({
          where: { recordId_doctorId: { recordId, doctorId: dto.doctorId } },
          update: { revokedAt: null, expiresAt: plan.sharesExpireAt, grantedAt: now },
          create: { recordId, doctorId: dto.doctorId, expiresAt: plan.sharesExpireAt },
        });
      }
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "second_opinion.request", objectType: "second_opinion", objectId: id, meta: { doctorId: dto.doctorId, records: recordIds.length, summary: dto.includeVisitSummary } });
      return { id, acceptDeadlineAt: plan.acceptDeadlineAt };
    });
    await this.notifications.push(dto.doctorId, { kind: "SECOND_OPINION_REQUESTED", titleFa: "درخواست نظر دوم جدید", bodyFa: `تا ${DEFAULT_SO_CONFIG.acceptWithinHours} ساعت برای پذیرش یا رد فرصت دارید.`, payload: { secondOpinionId: out.id } });
    return out;
  }

  // ───────────── خواندن ─────────────
  async list(u: AuthUser) {
    const rows = await this.prisma.withContext({ role: u.role, userId: u.id }, (tx) =>
      tx.secondOpinion.findMany({
        where: u.role === "DOCTOR" ? { doctorId: u.id } : { patientId: u.id }, orderBy: { createdAt: "desc" }, take: 50,
        select: { id: true, status: true, createdAt: true, acceptDeadlineAt: true, answerDeadlineAt: true, respondedAt: true, doctor: { select: { fullName: true } } },
      }),
    );
    // پزشک نام بیمار را نمی‌بیند؛ پزشک نظر‌دهنده فقط برای بیمار نمایش داده می‌شود
    return rows.map((r) => ({ id: r.id, status: r.status, createdAt: r.createdAt, acceptDeadlineAt: r.acceptDeadlineAt, answerDeadlineAt: r.answerDeadlineAt, respondedAt: r.respondedAt, doctorName: u.role === "PATIENT" ? r.doctor.fullName : undefined }));
  }

  async get(u: AuthUser, id: string) {
    return this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      const so = await tx.secondOpinion.findUnique({ where: { id }, include: { doctor: { select: { fullName: true } } } });
      if (!so || (so.patientId !== u.id && so.doctorId !== u.id)) throw new NotFoundException();
      const asDoctor = so.doctorId === u.id;
      if (asDoctor) await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "second_opinion.read", objectType: "second_opinion", objectId: id });

      let records: { id: string; title: string; category: string; attachmentCount: number }[] = [];
      let visitSummary: { text: string; followUpDays: number | null } | null = null;
      if (asDoctor && ["REQUESTED", "ACCEPTED", "ANSWERED"].includes(so.status)) {
        // RLS خودش فقط پرونده‌های دارای اشتراک فعال را برمی‌گرداند
        const rs = await tx.healthRecord.findMany({ where: { id: { in: so.sharedRecordIds } }, select: { id: true, title: true, category: true, _count: { select: { attachments: true } } } });
        records = rs.map((r) => ({ id: r.id, title: r.title, category: r.category, attachmentCount: r._count.attachments }));
        if (so.includeVisitSummary) {
          const v = await tx.visitSummary.findUnique({ where: { appointmentId: so.appointmentId }, select: { id: true, summaryEnc: true } });
          if (v) visitSummary = JSON.parse(this.crypto.decryptString(v.summaryEnc, aad("visit_summaries", v.id, "summary")));
        }
      }
      return {
        id: so.id, status: so.status, createdAt: so.createdAt, acceptDeadlineAt: so.acceptDeadlineAt, answerDeadlineAt: so.answerDeadlineAt, respondedAt: so.respondedAt,
        role: asDoctor ? ("doctor" as const) : ("patient" as const), doctorName: asDoctor ? undefined : so.doctor.fullName, includeVisitSummary: so.includeVisitSummary,
        request: JSON.parse(this.crypto.decryptString(so.requestEnc, aad("second_opinions", id, "request"))) as { question: string; caseSummary: string; ageYears: number | null; gender: string | null },
        response: so.responseEnc ? (JSON.parse(this.crypto.decryptString(so.responseEnc, aad("second_opinions", id, "response"))) as AnswerInput) : null,
        records, visitSummary, appointmentId: asDoctor ? undefined : so.appointmentId,
      };
    });
  }

  // ───────────── اقدام‌ها ─────────────
  accept(u: AuthUser, id: string) { return this.apply({ kind: "user", user: u }, id, "ACCEPT"); }
  decline(u: AuthUser, id: string) { return this.apply({ kind: "user", user: u }, id, "DECLINE"); }
  cancel(u: AuthUser, id: string) { return this.apply({ kind: "user", user: u }, id, "CANCEL"); }
  answer(u: AuthUser, id: string, a: AnswerInput) { return this.apply({ kind: "user", user: u }, id, "ANSWER", a); }

  async apply(actor: Actor, id: string, action: SoAction, answer?: AnswerInput, now = new Date()) {
    const ctx = actor.kind === "system" ? ({ role: "SYSTEM" } as const) : ({ role: actor.user.role, userId: actor.user.id } as const);
    const r = await this.prisma.withContext(ctx, async (tx) => {
      const so = await tx.secondOpinion.findUnique({ where: { id }, select: { id: true, status: true, patientId: true, doctorId: true, acceptDeadlineAt: true, answerDeadlineAt: true, sharedRecordIds: true } });
      if (!so) throw new NotFoundException();
      const who = SO_ACTOR[action];
      const allowed = who === "system" ? actor.kind === "system" : actor.kind === "user" && actor.user.id === (who === "doctor" ? so.doctorId : so.patientId);
      if (!allowed) throw new NotFoundException(); // وجود درخواست برای غیرمرتبط‌ها لو نرود
      const plan = planSoAction(action, { status: so.status as SoStatus, acceptDeadlineAt: so.acceptDeadlineAt, answerDeadlineAt: so.answerDeadlineAt }, now);
      if (!plan.ok) {
        if (plan.error === "invalid_state") throw new ConflictException({ error: "invalid_state", status: so.status });
        throw new UnprocessableEntityException({ error: plan.error });
      }
      const upd = await tx.secondOpinion.updateMany({
        where: { id, status: so.status },
        data: {
          status: plan.to,
          ...(action === "ACCEPT" ? { answerDeadlineAt: plan.answerDeadlineAt } : {}),
          ...(action === "ACCEPT" || action === "DECLINE" || action === "ANSWER" ? { respondedAt: now } : {}),
          ...(action === "ANSWER" && answer ? { responseEnc: this.crypto.encrypt(JSON.stringify(answer), aad("second_opinions", id, "response")) } : {}),
        },
      });
      if (upd.count !== 1) throw new ConflictException({ error: "concurrent_modification" });
      await this.audit.logIn(tx, {
        actorId: actor.kind === "user" ? actor.user.id : null, actorRole: actor.kind === "user" ? actor.user.role : "SYSTEM",
        action: `second_opinion.${action.toLowerCase()}`, objectType: "second_opinion", objectId: id, meta: { from: so.status, to: plan.to },
      });
      return { so, to: plan.to };
    });

    // پس از commit: لغو اشتراک پرونده‌ها (بهترین تلاش؛ انقضای طبیعی اشتراک پشتوانه است) و اعلان
    if (SO_REVOKES_SHARES.includes(r.to)) await this.revokeShares(r.so.doctorId, r.so.sharedRecordIds);
    const n = {
      ACCEPT: { kind: "SECOND_OPINION_ACCEPTED", titleFa: "پزشک درخواست نظر دوم را پذیرفت", bodyFa: "پاسخ تا مهلت مقرر ثبت می‌شود." },
      DECLINE: { kind: "SECOND_OPINION_DECLINED", titleFa: "درخواست نظر دوم پذیرفته نشد", bodyFa: "می‌توانید از پزشک دیگری درخواست کنید." },
      ANSWER: { kind: "SECOND_OPINION_READY", titleFa: "پاسخ نظر دوم آماده است", bodyFa: "پاسخ پزشک را ببینید." },
      EXPIRE: { kind: "SYSTEM", titleFa: "درخواست نظر دوم بی‌پاسخ ماند", bodyFa: "مهلت پزشک تمام شد؛ می‌توانید از پزشک دیگری درخواست کنید." },
    } as const;
    if (action !== "CANCEL") await this.notifications.push(r.so.patientId, { ...n[action], payload: { secondOpinionId: id } });
    return { id, status: r.to };
  }

  private async revokeShares(doctorId: string, recordIds: string[]) {
    if (!recordIds.length) return;
    try {
      await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
        tx.recordShare.updateMany({ where: { doctorId, recordId: { in: recordIds }, revokedAt: null }, data: { revokedAt: new Date() } }),
      );
    } catch (e) { this.log.warn(`revokeShares failed: ${(e as Error).message}`); }
  }

  /** کار دوره‌ای: انقضای درخواست‌های بی‌پاسخ. ایدمپوتنت و امن برای چند نمونه. */
  async expireStale(now = new Date()): Promise<number> {
    const rows = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.secondOpinion.findMany({
        where: { OR: [{ status: "REQUESTED", acceptDeadlineAt: { lte: now } }, { status: "ACCEPTED", answerDeadlineAt: { lte: now } }] },
        select: { id: true }, orderBy: { acceptDeadlineAt: "asc" }, take: 200,
      }),
    );
    let n = 0;
    for (const { id } of rows) {
      try { await this.apply({ kind: "system" }, id, "EXPIRE", undefined, now); n++; }
      catch (e) { if (!(e instanceof ConflictException || e instanceof NotFoundException || e instanceof UnprocessableEntityException)) this.log.error(`expire failed for ${id}: ${(e as Error).message}`); }
    }
    return n;
  }
}
