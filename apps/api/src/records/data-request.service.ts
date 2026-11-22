import { randomUUID } from "node:crypto";
import { ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../common/decorators";
import { aad, FIELD_CRYPTO, type FieldCrypto } from "../crypto";
import { NotificationService } from "../notifications/notification.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { FhirService } from "./fhir.service";

export type ReviewDecision = "APPROVE" | "REJECT";
const GRACE_DAYS = 30;
const APPROVALS_REQUIRED = 2;

/**
 * A6: اجرای واقعی درخواستهای خروجی/حذف با تأیید دو نفره و دورهٔ grace.
 * تمام نوشتنها با نقش SYSTEM و ثبت ممیزی اند؛ دادهٔ مالی/audit طبق الزام نگهداری، حذف نمیشود.
 */
@Injectable()
export class DataRequestService {
  private readonly log = new Logger(DataRequestService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
    @Inject(NotificationService) private readonly notifications: NotificationService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(FhirService) private readonly fhir: FhirService,
  ) {}

  listAll() {
    return this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.dataRequest.findMany({
        orderBy: { requestedAt: "desc" }, take: 200,
        select: {
          id: true, userId: true, type: true, status: true, note: true,
          requestedAt: true, executeAt: true, completedAt: true, objectKey: true,
          reviews: { select: { adminId: true, decision: true, createdAt: true } },
        },
      }),
    );
  }

  /** هر ادمین فقط یک رأی؛ بعد از ۲ تأیید مستقل، اجرا ۳۰ روز بعد انجام میشود. */
  async review(id: string, admin: AuthUser, decision: ReviewDecision, note?: string) {
    return this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const req = await tx.dataRequest.findUnique({ where: { id }, select: { id: true, status: true, userId: true, type: true } });
      if (!req) throw new NotFoundException();
      if (req.status !== "PENDING") throw new ConflictException({ error: "request_not_pending", message: "request_not_pending" });
      await tx.dataRequestReview.create({ data: { requestId: id, adminId: admin.id, decision, note } });
      const approvals = await tx.dataRequestReview.count({ where: { requestId: id, decision: "APPROVE" } });
      if (decision === "REJECT") {
        await tx.dataRequest.update({ where: { id }, data: { status: "REJECTED", note } });
      } else if (approvals >= APPROVALS_REQUIRED) {
        await tx.dataRequest.update({
          where: { id },
          data: { status: "IN_PROGRESS", executeAt: new Date(Date.now() + GRACE_DAYS * 86_400_000) },
        });
      }
      await this.audit.logIn(tx, {
        actorId: admin.id, actorRole: "ADMIN", action: `data_request.${decision.toLowerCase()}`,
        objectType: "data_request", objectId: id,
        meta: { approvals, required: APPROVALS_REQUIRED, type: req.type },
      });
      return { id, status: decision === "REJECT" ? "REJECTED" : approvals >= APPROVALS_REQUIRED ? "IN_PROGRESS" : "PENDING", approvals };
    });
  }

  /**job: اجرای درخواستهای رسیده به موعد. */
  async processDue(now = new Date()) {
    const due = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.dataRequest.findMany({
        where: { status: "IN_PROGRESS", executeAt: { lte: now } },
        select: { id: true, userId: true, type: true }, take: 20,
      }),
    );
    let done = 0;
    for (const r of due) {
      try {
        if (r.type === "EXPORT") await this.executeExport(r.id, r.userId);
        else await this.executeDelete(r.id, r.userId);
        done++;
      } catch (e) {
        this.log.error(`data request ${r.id} failed: ${(e as Error).message}`);
      }
    }
    return { processed: done };
  }

  private async executeExport(id: string, userId: string) {
    const bundle = await this.fhir.exportForPatient({ id: userId, role: "PATIENT" }, new Date(), true);
    const objectKey = `exports/${userId}/${id}.fhir.json`;
    await this.storage.putTextObject("records", objectKey, JSON.stringify(bundle), "application/fhir+json");
    await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      await tx.dataRequest.update({ where: { id }, data: { status: "COMPLETED", objectKey, completedAt: new Date() } });
      await this.audit.logIn(tx, { action: "data_request.export_completed", objectType: "data_request", objectId: id, meta: { userId } });
    });
    await this.notifications.push(userId, {
      kind: "DATA_REQUEST_READY", titleFa: "خروجی پرونده آماده است",
      bodyFa: "فایل خروجی پرونده سلامت شما آماده شد. لطفاً از ناحیه کاربری خود آن را دریافت کنید.",
      payload: { requestId: id },
    });
  }

  /**
   * حذف دادهٔ سلامت — سوابق مالی و زنجیره ممیزی به دلیل الزام نگهداری قانونی باقی میمانند.
   */
  private async executeDelete(id: string, userId: string) {
    await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      await tx.scribeSession.deleteMany({ where: { patientId: userId } });
      await tx.vitalReading.deleteMany({ where: { patientId: userId } });
      await tx.visitSummary.deleteMany({ where: { patientId: userId } });
      await tx.soapNote.deleteMany({ where: { patientId: userId } });
      await tx.prescription.deleteMany({ where: { patientId: userId } });
      await tx.healthRecord.deleteMany({ where: { patientId: userId } });
      await tx.patientHealthProfile.deleteMany({ where: { patientId: userId } });
      await tx.familyMember.deleteMany({ where: { ownerId: userId } });
      await tx.triageSession.deleteMany({ where: { patientId: userId } });
      await tx.secondOpinion.deleteMany({ where: { patientId: userId } });
      await tx.conversation.deleteMany({ where: { patientId: userId } });
      await tx.appointmentWaitlist.deleteMany({ where: { patientId: userId } });
      await tx.pushSubscription.deleteMany({ where: { userId } });
      await tx.notification.deleteMany({ where: { userId } });
      await tx.consent.deleteMany({ where: { userId } });
      await tx.session.deleteMany({ where: { userId } });
      await tx.user.update({
        where: { id: userId },
        data: {
          status: "DELETED",
          phoneHash: this.crypto.blindIndex(randomUUID(), `deleted:${userId}`),
          phoneEnc: this.crypto.encrypt("[deleted]", aad("users", userId, "phone")),
          mfaSecretEnc: null, mfaEnabledAt: null, mfaRecoveryHash: null,
        },
      });
      await tx.patientProfile.update({ where: { userId }, data: { fullName: "حذفشده" } }).catch(() => undefined);
      await tx.doctorProfile.update({ where: { userId }, data: { fullName: "حذفشده", isListed: false } }).catch(() => undefined);
      await tx.dataRequest.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date() } });
      await this.audit.logIn(tx, { action: "data_request.delete_completed", objectType: "data_request", objectId: id, meta: { userId } });
    });
  }
}
