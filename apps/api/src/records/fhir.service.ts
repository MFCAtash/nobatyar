import { randomUUID } from "node:crypto";
import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../common/decorators";
import { aad, FIELD_CRYPTO, type FieldCrypto } from "../crypto";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import type { SoapContent } from "../soap/soap-policy";
import { EMPTY_PROFILE, normalizeProfile } from "../health-profile/health-profile";
import { buildFhirBundle } from "./fhir-export";

export type DataRequestKind = "EXPORT" | "DELETE";

@Injectable()
export class FhirService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  /** خروجی FHIR R4 — فقط خود بیمار و با رضایت فعال پردازش داده سلامت. */
  async exportForPatient(u: AuthUser, now = new Date(), skipConsent = false, includeDocuments = false) {
    if (u.role !== "PATIENT") throw new ForbiddenException({ error: "forbidden" });
    // A6:job خروجی تأییدشده نیازی به رضایت لحظهای دوباره ندارد (خود درخواست، رضایت محسوب میشود).
    if (!skipConsent) {
      const consent = await this.prisma.withContext({ role: u.role, userId: u.id }, (tx) =>
        tx.consent.findFirst({ where: { userId: u.id, type: "HEALTH_DATA_PROCESSING", revokedAt: null }, select: { id: true } }),
      );
      if (!consent) throw new ForbiddenException({ error: "consent_required", consent: "HEALTH_DATA_PROCESSING" });
    }

    const data = await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      const [profile, hp, records, notes, vitals] = await Promise.all([
        tx.patientProfile.findUnique({
          where: { userId: u.id },
          select: { userId: true, fullName: true, birthDateEnc: true, gender: true },
        }),
        tx.patientHealthProfile.findUnique({ where: { patientId: u.id }, select: { dataEnc: true } }),
        tx.healthRecord.findMany({ where: { patientId: u.id }, select: { id: true, title: true, category: true, visitDate: true, createdAt: true, contentEnc: true }, orderBy: { createdAt: "desc" }, take: 500 }),
        tx.soapNote.findMany({ where: { patientId: u.id, status: "SIGNED" }, select: { id: true, contentEnc: true }, orderBy: { createdAt: "desc" }, take: 500 }),
        tx.vitalReading.findMany({ where: { patientId: u.id }, select: { id: true, type: true, valuePrimary: true, valueSecondary: true, unit: true, measuredAt: true }, orderBy: { measuredAt: "desc" }, take: 1000 }),
      ]);
      if (!profile) throw new NotFoundException();
      const phone = await tx.user.findUnique({ where: { id: u.id }, select: { phoneEnc: true } });
      return { profile, hp, records, notes, vitals, phone };
    });

    const hp = data.hp?.dataEnc
      ? normalizeProfile(JSON.parse(this.crypto.decryptString(data.hp.dataEnc, aad("patient_health_profiles", u.id, "data"))))
      : EMPTY_PROFILE;
    const diagnoses = data.notes.flatMap((n) => {
      const c = JSON.parse(this.crypto.decryptString(n.contentEnc, aad("soap_notes", n.id, "content"))) as SoapContent;
      return (c.diagnoses ?? []).map((d) => ({ code: d.code ?? null, text: d.text }));
    });
    const bundle = buildFhirBundle({
      patient: {
        id: u.id, fullName: data.profile.fullName,
        phone: data.phone ? this.crypto.decryptString(data.phone.phoneEnc, aad("users", u.id, "phone")) : null,
        birthDate: data.profile.birthDateEnc ? this.crypto.decryptString(data.profile.birthDateEnc, aad("patient_profiles", u.id, "birth_date")) : null,
        gender: data.profile.gender,
        bloodType: hp.bloodType,
      },
      vitals: data.vitals,
      diagnoses,
      records: data.records.map((r) => ({
        id: r.id, title: r.title, category: r.category, visitDate: r.visitDate, createdAt: r.createdAt,
        ...(includeDocuments ? { contentText: this.crypto.decryptString(r.contentEnc, aad("health_records", r.id, "content")) } : {}),
      })),
      medications: hp.medications.map((name) => ({ name })),
      allergies: hp.allergies.map((name) => ({ name })),
      now,
    });
    await this.audit.log({ actorId: u.id, actorRole: u.role, action: "fhir.exported", objectType: "patient", objectId: u.id });
    return bundle;
  }

  /** درخواست خروجی کامل (JSON) یا حذف — توسط job ممیزی/اجرا میشود. */
  async request(u: AuthUser, type: DataRequestKind) {
    const id = randomUUID();
    await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      await tx.dataRequest.create({ data: { id, userId: u.id, type, status: "PENDING" } });
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: `data_request.${type.toLowerCase()}_requested`, objectType: "data_request", objectId: id });
    });
    return { id, type, status: "PENDING" as const };
  }

  listRequests(u: AuthUser) {
    return this.prisma.withContext({ role: u.role, userId: u.id }, (tx) =>
      tx.dataRequest.findMany({
        where: { userId: u.id }, orderBy: { requestedAt: "desc" }, take: 50,
        select: { id: true, type: true, status: true, requestedAt: true, completedAt: true, objectKey: true },
      }),
    );
  }

  /** لینک موقت دانلود خروجی کامل (فقط صاحب درخواست و درخواست COMPLETED). */
  async downloadUrl(u: AuthUser, id: string) {
    const r = await this.prisma.withContext({ role: u.role, userId: u.id }, (tx) =>
      tx.dataRequest.findUnique({ where: { id }, select: { userId: true, status: true, objectKey: true } }),
    );
    if (!r || r.userId !== u.id) throw new NotFoundException();
    if (r.status !== "COMPLETED" || !r.objectKey) throw new ForbiddenException({ error: "export_not_ready" });
    await this.audit.log({ actorId: u.id, actorRole: u.role, action: "data_request.downloaded", objectType: "data_request", objectId: id });
    return this.storage.createDownloadUrl("records", r.objectKey, "nobatyar-data-export.json", 300);
  }

  async cancelRequest(u: AuthUser, id: string) {
    const r = await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      const found = await tx.dataRequest.findUnique({ where: { id }, select: { userId: true, status: true } });
      if (!found || found.userId !== u.id) throw new NotFoundException();
      if (found.status !== "PENDING") throw new ForbiddenException({ error: "request_not_pending" });
      await tx.dataRequest.update({ where: { id }, data: { status: "REJECTED" } });
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "data_request.cancelled", objectType: "data_request", objectId: id });
      return { id, status: "REJECTED" as const };
    });
    return r;
  }
}
