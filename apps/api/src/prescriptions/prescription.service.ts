import { randomBytes, timingSafeEqual } from "node:crypto";
import { randomUUID } from "node:crypto";
import { ConflictException, HttpException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { RateLimiter } from "../auth/rate-limit";
import type { AuthUser } from "../common/decorators";
import { aad, FIELD_CRYPTO, FieldCrypto } from "../crypto";
import { HealthProfileService } from "../health-profile/health-profile.service";
import { NotificationService } from "../notifications/notification.service";
import { PrismaService } from "../prisma/prisma.service";
import { KV_STORE, KeyValueStore } from "../redis/kv-store";
import { ALLERGY_CHECK_NOTE_FA, DEFAULT_RX_CONFIG, IssueError, planCancel, planIssue, RX_NUMBER_RE, rxNumberFromBytes, rxView, RxItem } from "./prescription-policy";

export interface IssueInput { items: RxItem[]; validDays?: number; acknowledgeWarnings?: boolean }
const VERIFY_PER_10MIN = 20;

@Injectable()
export class PrescriptionService {
  private readonly limiter: RateLimiter;
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(HealthProfileService) private readonly profiles: HealthProfileService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
    @Inject(KV_STORE) kv: KeyValueStore,
  ) { this.limiter = new RateLimiter(kv); }

  /** کد راستی‌آزمایی بدون ذخیره‌سازی: HMAC شماره‌ی نسخه (فقط بیمار آن را می‌بیند). */
  verifyCodeOf(number: string): string { return this.crypto.blindIndex(number, "rx-verify").slice(0, 8).toUpperCase(); }

  private denyIssue(e: Extract<ReturnType<typeof planIssue>, { ok: false }>): HttpException {
    const code: IssueError = e.error;
    if (code === "not_participant") return new NotFoundException();
    if (code === "invalid_state") return new ConflictException({ error: "invalid_state" });
    if (code === "allergy_warning") return new ConflictException({ error: "allergy_warning", warnings: e.warnings, noteFa: ALLERGY_CHECK_NOTE_FA });
    return new UnprocessableEntityException({ error: code, issues: e.details });
  }

  async issue(u: AuthUser, appointmentId: string, dto: IssueInput, now = new Date()) {
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
          const a = await tx.appointment.findUnique({ where: { id: appointmentId }, select: { doctorId: true, patientId: true, status: true, endsAt: true } });
          if (!a || a.doctorId !== u.id) throw new NotFoundException();
          const { allergies, onFile } = await this.profiles.allergiesIn(tx, a.patientId);
          const plan = planIssue({
            appointmentStatus: a.status, endsAt: a.endsAt, userId: u.id, doctorId: a.doctorId, items: dto.items, allergies,
            acknowledgedWarnings: !!dto.acknowledgeWarnings, validDays: dto.validDays,
          }, now, DEFAULT_RX_CONFIG);
          if (!plan.ok) throw this.denyIssue(plan);

          const id = randomUUID();
          const number = rxNumberFromBytes(randomBytes(8));
          await tx.prescription.create({
            data: {
              id, number, appointmentId, doctorId: u.id, patientId: a.patientId, validUntil: plan.validUntil, issuedAt: now,
              warningsAcknowledged: plan.warnings.length > 0, itemsEnc: this.crypto.encrypt(JSON.stringify(dto.items), aad("prescriptions", id, "items")),
            },
          });
          await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "prescription.issue", objectType: "prescription", objectId: id, meta: { allergyAck: plan.warnings.length > 0, items: dto.items.length } });
          return { id, number, validUntil: plan.validUntil, warnings: plan.warnings, patientId: a.patientId, allergyProfileOnFile: onFile };
        });
        await this.notifications.push(r.patientId, { kind: "PRESCRIPTION_ISSUED", titleFa: "نسخه‌ی جدید برای شما صادر شد", bodyFa: "نسخه را در بخش «نسخه‌های من» ببینید.", payload: { prescriptionId: r.id, appointmentId } });
        return { id: r.id, number: r.number, validUntil: r.validUntil, warnings: r.warnings, allergyProfileOnFile: r.allergyProfileOnFile, allergyCheckNoteFa: ALLERGY_CHECK_NOTE_FA };
      } catch (e) {
        // برخورد نادر شماره‌ی یکتا (P2002) ⇒ شماره‌ی تازه
        if ((e as { code?: string }).code === "P2002" && attempt < 3) continue;
        throw e;
      }
    }
  }

  private present(u: AuthUser, r: { id: string; number: string; status: "ISSUED" | "CANCELLED"; issuedAt: Date; validUntil: Date; cancelledAt: Date | null; itemsEnc: Uint8Array; warningsAcknowledged: boolean; appointmentId: string; doctor: { fullName: string }; patient: { fullName: string } }, now = new Date()) {
    const isPatient = r.patient && u.role === "PATIENT";
    return {
      id: r.id, number: r.number, appointmentId: r.appointmentId, status: rxView(r.status, r.validUntil, now),
      issuedAt: r.issuedAt, validUntil: r.validUntil, cancelledAt: r.cancelledAt,
      doctor: { fullName: r.doctor.fullName }, patient: { fullName: r.patient.fullName },
      items: JSON.parse(this.crypto.decryptString(r.itemsEnc, aad("prescriptions", r.id, "items"))) as RxItem[],
      verifyCode: isPatient ? this.verifyCodeOf(r.number) : undefined,
      allergyWarningAcknowledged: u.role === "DOCTOR" ? r.warningsAcknowledged : undefined,
    };
  }
  private readonly sel = {
    id: true, number: true, status: true, issuedAt: true, validUntil: true, cancelledAt: true, itemsEnc: true, warningsAcknowledged: true, appointmentId: true,
    doctor: { select: { fullName: true } }, patient: { select: { fullName: true } },
  } as const;

  async listMine(u: AuthUser) {
    const rows = await this.prisma.withContext({ role: u.role, userId: u.id }, (tx) =>
      tx.prescription.findMany({ where: u.role === "DOCTOR" ? { doctorId: u.id } : { patientId: u.id }, orderBy: { issuedAt: "desc" }, take: 50, select: this.sel }),
    );
    return rows.map((r) => this.present(u, r));
  }

  async listForAppointment(u: AuthUser, appointmentId: string) {
    const rows = await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      const a = await tx.appointment.findUnique({ where: { id: appointmentId }, select: { doctorId: true, patientId: true } });
      if (!a || (a.doctorId !== u.id && a.patientId !== u.id)) throw new NotFoundException();
      return tx.prescription.findMany({ where: { appointmentId }, orderBy: { issuedAt: "desc" }, select: this.sel });
    });
    return rows.map((r) => this.present(u, r));
  }

  async getOne(u: AuthUser, id: string) {
    const r = await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      const row = await tx.prescription.findUnique({ where: { id }, select: this.sel });
      if (row && u.role === "PATIENT") await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "prescription.read", objectType: "prescription", objectId: id });
      return row;
    });
    if (!r) throw new NotFoundException();
    return this.present(u, r);
  }

  async cancel(u: AuthUser, id: string, reason: string, now = new Date()) {
    const patientId = await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      const r = await tx.prescription.findUnique({ where: { id }, select: { status: true, doctorId: true, patientId: true } });
      if (!r || r.doctorId !== u.id) throw new NotFoundException();
      const plan = planCancel({ status: r.status, userId: u.id, doctorId: r.doctorId, reason });
      if (!plan.ok) {
        if (plan.error === "already_cancelled") throw new ConflictException({ error: "already_cancelled" });
        if (plan.error === "reason_required") throw new UnprocessableEntityException({ error: "reason_required" });
        throw new NotFoundException();
      }
      const upd = await tx.prescription.updateMany({
        where: { id, status: "ISSUED" },
        data: { status: "CANCELLED", cancelledAt: now, cancelReasonEnc: this.crypto.encrypt(reason.trim(), aad("prescriptions", id, "cancel_reason")) },
      });
      if (upd.count !== 1) throw new ConflictException({ error: "concurrent_modification" });
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "prescription.cancel", objectType: "prescription", objectId: id });
      return r.patientId;
    });
    await this.notifications.push(patientId, { kind: "PRESCRIPTION_CANCELLED", titleFa: "یک نسخه‌ی شما باطل شد", bodyFa: "جزئیات را در بخش «نسخه‌های من» ببینید.", payload: { prescriptionId: id } });
    return { status: "CANCELLED" as const };
  }

  /** راستی‌آزمایی عمومی (داروخانه): فقط اعتبار و وضعیت؛ هیچ قلم دارو یا هویت بیمار برنمی‌گردد. پاسخ ناموفق یکسان است. */
  async publicVerify(number: string, code: string, ip: string, now = new Date()) {
    const rl = await this.limiter.hit(`rx:verify:${ip}`, VERIFY_PER_10MIN, 600);
    if (!rl.allowed) throw new HttpException({ error: "too_many_requests", retryAfterSec: rl.retryAfterSec }, 429);
    const n = number.trim().toUpperCase();
    const expected = RX_NUMBER_RE.test(n) ? this.verifyCodeOf(n) : "";
    const given = code.trim().toUpperCase();
    const codeOk = expected.length > 0 && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
    const row = codeOk
      ? await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
          tx.prescription.findUnique({ where: { number: n }, select: { status: true, issuedAt: true, validUntil: true, doctor: { select: { fullName: true } } } }),
        )
      : null;
    if (!row) throw new NotFoundException({ error: "not_found" });
    const view = rxView(row.status, row.validUntil, now);
    return { valid: view === "ACTIVE", status: view, issuedAt: row.issuedAt, validUntil: row.validUntil, doctorName: row.doctor.fullName };
  }
}
