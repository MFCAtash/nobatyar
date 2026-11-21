import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../common/decorators";
import { aad, FIELD_CRYPTO, type FieldCrypto } from "../crypto";
import { NotificationService } from "../notifications/notification.service";
import { OUTBOX_WRITER, type OutboxWriter } from "../outbox/outbox.service";
import { PrismaService } from "../prisma/prisma.service";
import { SoapService } from "../soap/soap.service";
import { draftFromTranscript, redactPii, type ScribeDraft } from "./scribe-policy";

/** متن خام حداکثر ۱۵ دقیقه در DB میماند و توسط job پاک میشود. */
export const SCRIBE_TTL_MIN = (() => {
  const n = Number(process.env.SCRIBE_TTL_MINUTES ?? 15);
  return Number.isInteger(n) && n >= 5 && n <= 120 ? n : 15;
})();
const TRANSCRIPT_MAX_CHARS = 30_000;

@Injectable()
export class ScribeService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
    @Inject(OUTBOX_WRITER) private readonly outbox: OutboxWriter,
    @Inject(SoapService) private readonly soap: SoapService,
  ) {}

  private async consentAt(userId: string): Promise<Date | null> {
    const c = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.consent.findFirst({ where: { userId, type: "AMBIENT_SCRIBE", revokedAt: null }, select: { grantedAt: true }, orderBy: { grantedAt: "desc" } }),
    );
    return c?.grantedAt ?? null;
  }

  private async doctorAppointment(u: AuthUser, appointmentId: string) {
    const a = await this.prisma.withContext({ role: u.role, userId: u.id }, (tx) =>
      tx.appointment.findUnique({
        where: { id: appointmentId },
        select: { id: true, doctorId: true, patientId: true, status: true, scribeSession: { select: { id: true, status: true, expiresAt: true } } },
      }),
    );
    if (!a || a.doctorId !== u.id) throw new NotFoundException(); // وجود نوبت دیگری لو نمیرود
    if (a.status !== "IN_PROGRESS" && a.status !== "COMPLETED") throw new ConflictException({ error: "invalid_state", status: a.status });
    return a;
  }

  private ensureActive(session: { expiresAt: Date; status: string }, now = new Date()) {
    if (session.expiresAt.getTime() <= now.getTime()) throw new UnprocessableEntityException({ error: "scribe_expired" });
    if (session.status === "DISCARDED" || session.status === "EXPIRED") throw new ConflictException({ error: "scribe_discarded" });
  }

  /** B6: نمایش چکلیست رضایت قبل از شروع (بدون افشای جزئیات رضایت طرف مقابل). */
  async consentStatus(u: AuthUser, appointmentId: string) {
    const a = await this.doctorAppointment(u, appointmentId);
    const [doctor, patient] = await Promise.all([this.consentAt(a.doctorId), this.consentAt(a.patientId)]);
    return { doctor: !!doctor, patient: !!patient, canStart: !!doctor && !!patient };
  }

  /** شروع جلسه فقط با رضایت صریح و فعال «هر دو» طرف. بدون رضایت = خاموش. */
  async start(u: AuthUser, appointmentId: string, now = new Date()) {
    const a = await this.doctorAppointment(u, appointmentId);
    if (a.scribeSession) throw new ConflictException({ error: "scribe_already_started" });
    const [doctor, patient] = await Promise.all([this.consentAt(a.doctorId), this.consentAt(a.patientId)]);
    if (!doctor || !patient) throw new ForbiddenException({ error: "scribe_consent_required", consents: { doctor: !!doctor, patient: !!patient } });
    await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      await tx.scribeSession.create({
        data: {
          appointmentId, doctorId: a.doctorId, patientId: a.patientId,
          doctorConsentAt: doctor, patientConsentAt: patient,
          expiresAt: new Date(now.getTime() + SCRIBE_TTL_MIN * 60_000),
        },
      });
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "scribe.started", objectType: "appointment", objectId: appointmentId, meta: { ttlMinutes: SCRIBE_TTL_MIN } });
    });
    return { status: "CONSENTED" as const, ttlMinutes: SCRIBE_TTL_MIN, consent: { doctor: true, patient: true } };
  }

  /** متن گفتار در همان لحظه پاکسازی PII شده و رمزنگاری میشود؛ فایل صوتی ذخیره نمیشود. */
  async uploadTranscript(u: AuthUser, appointmentId: string, transcript: string, now = new Date()) {
    if (transcript.length > TRANSCRIPT_MAX_CHARS) throw new UnprocessableEntityException({ error: "transcript_too_long" });
    const a = await this.doctorAppointment(u, appointmentId);
    if (!a.scribeSession) throw new NotFoundException({ error: "scribe_not_started" });
    this.ensureActive(a.scribeSession, now);
    const id = a.scribeSession.id;
    await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      await tx.scribeSession.update({
        where: { id },
        data: {
          transcriptEnc: this.crypto.encrypt(redactPii(transcript), aad("scribe_sessions", id, "transcript")),
          draftEnc: null, status: "TRANSCRIPT_READY",
        },
      });
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "scribe.transcript_uploaded", objectType: "appointment", objectId: appointmentId, meta: { chars: transcript.length } });
    });
    return { status: "TRANSCRIPT_READY" as const };
  }

  /** ساخت پیشنویس SOAP — «هرگز» امضا نمیشود و متن خام به مدل خارجی فرستاده نمیشود. */
  async generateDraft(u: AuthUser, appointmentId: string, now = new Date()) {
    const a = await this.doctorAppointment(u, appointmentId);
    if (!a.scribeSession) throw new NotFoundException({ error: "scribe_not_started" });
    this.ensureActive(a.scribeSession, now);
    const s = await this.prisma.withContext({ role: u.role, userId: u.id }, (tx) => tx.scribeSession.findUniqueOrThrow({ where: { appointmentId } }));
    if (!s.transcriptEnc) throw new ConflictException({ error: "transcript_missing" });
    const transcript = this.crypto.decryptString(s.transcriptEnc, aad("scribe_sessions", s.id, "transcript"));
    const draft = draftFromTranscript(transcript);
    await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      await tx.scribeSession.update({
        where: { id: s.id },
        data: { draftEnc: this.crypto.encrypt(JSON.stringify(draft), aad("scribe_sessions", s.id, "draft")), status: "DRAFT_GENERATED" },
      });
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "scribe.draft_generated", objectType: "appointment", objectId: appointmentId, meta: { model: s.model } });
      await this.outbox.enqueue(tx, {
        type: "scribe.draft_generated", aggregateType: "appointment", aggregateId: appointmentId,
        payload: { appointmentId, patientId: a.patientId, doctorId: a.doctorId },
      });
    });
    await this.notifications.push(u.id, {
      kind: "SCRIBE_DRAFT_READY", titleFa: "پیشنویس سلامت آماده است", bodyFa: "پیشنویس SOAP آماده بازبینی است. هیچ موردی خودکار امضا نشده است.",
      payload: { appointmentId },
    });
    return draft;
  }

  async getDraft(u: AuthUser, appointmentId: string): Promise<{ status: string; draft: ScribeDraft | null }> {
    const a = await this.doctorAppointment(u, appointmentId);
    if (!a.scribeSession) return { status: "NOT_STARTED", draft: null };
    const s = await this.prisma.withContext({ role: u.role, userId: u.id }, (tx) => tx.scribeSession.findUniqueOrThrow({ where: { appointmentId } }));
    if (!s.draftEnc) return { status: s.status, draft: null };
    return { status: s.status, draft: JSON.parse(this.crypto.decryptString(s.draftEnc, aad("scribe_sessions", s.id, "draft"))) as ScribeDraft };
  }

  /** انتقال صریح پیشنویس به SOAP به عنوان «DRAFT»؛ امضا فقط توسط SoapService.sign با دخالت پزشک انجام میشود. */
  async applyToSoap(u: AuthUser, appointmentId: string, expectedVersion?: number) {
    const draft = await this.getDraft(u, appointmentId);
    if (!draft.draft) throw new ConflictException({ error: "scribe_no_draft" });
    const d = draft.draft;
    // A5: جلوگیری از بازنویسی ویرایش همزمان پزشک توسط پیشنویس AI
    await this.soap.saveDraft(u, appointmentId, {
      subjective: d.subjective, objective: d.objective, assessment: d.assessment, plan: d.plan,
      patientSummary: d.patientSummary,
    }, expectedVersion);
    return { applied: true as const, signed: false as const };
  }

  /** پاکسازی فوری (درخواست پزشک): متن خام و پیشنویس حذف میشود. */
  async discard(u: AuthUser, appointmentId: string) {
    const a = await this.doctorAppointment(u, appointmentId);
    if (!a.scribeSession) throw new NotFoundException({ error: "scribe_not_started" });
    const s = await this.prisma.withContext({ role: u.role, userId: u.id }, (tx) => tx.scribeSession.findUniqueOrThrow({ where: { appointmentId } }));
    await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      await tx.scribeSession.update({
        where: { id: s.id },
        data: { status: "DISCARDED", transcriptEnc: null, draftEnc: null },
      });
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "scribe.discarded", objectType: "appointment", objectId: appointmentId });
    });
    return { discarded: true };
  }

  /** job نگهداشت: انقضای TTL ⇒ حذف فیزیکی متن خام و پیشنویس. */
  async purgeExpired(now = new Date()) {
    const rows = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.scribeSession.findMany({ where: { expiresAt: { lte: now }, status: { in: ["CONSENTED", "TRANSCRIPT_READY", "DRAFT_GENERATED"] } }, select: { id: true, appointmentId: true } }),
    );
    await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      for (const r of rows) {
        await tx.scribeSession.update({ where: { id: r.id }, data: { status: "EXPIRED", transcriptEnc: null, draftEnc: null } });
        await this.audit.logIn(tx, { action: "scribe.purged", objectType: "appointment", objectId: r.appointmentId });
      }
    });
    return { purged: rows.length };
  }
}
