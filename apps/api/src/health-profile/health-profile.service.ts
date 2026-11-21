import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../common/decorators";
import { aad, FIELD_CRYPTO, FieldCrypto } from "../crypto";
import { PrismaService } from "../prisma/prisma.service";
import { EMPTY_PROFILE, HealthProfile, normalizeProfile } from "./health-profile";

@Injectable()
export class HealthProfileService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private decode(patientId: string, blob: Uint8Array | null): HealthProfile {
    if (!blob) return { ...EMPTY_PROFILE };
    return normalizeProfile(JSON.parse(this.crypto.decryptString(blob, aad("patient_health_profiles", patientId, "data"))));
  }

  async getMine(u: AuthUser) {
    const row = await this.prisma.withContext({ role: u.role, userId: u.id }, (tx) =>
      tx.patientHealthProfile.findUnique({ where: { patientId: u.id }, select: { dataEnc: true, updatedAt: true } }),
    );
    return { ...this.decode(u.id, row?.dataEnc ?? null), updatedAt: row?.updatedAt ?? null };
  }

  async saveMine(u: AuthUser, raw: Partial<Record<keyof HealthProfile, unknown>>) {
    const p = normalizeProfile(raw);
    const dataEnc = this.crypto.encrypt(JSON.stringify(p), aad("patient_health_profiles", u.id, "data"));
    return this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      const r = await tx.patientHealthProfile.upsert({ where: { patientId: u.id }, update: { dataEnc }, create: { patientId: u.id, dataEnc }, select: { updatedAt: true } });
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "health_profile.update", objectType: "patient_health_profile", objectId: u.id });
      return { ...p, updatedAt: r.updatedAt };
    });
  }

  /** پزشکِ همین نوبت (ایمنی دارویی). RLS php_read دسترسی را به «نوبت فعال/اخیر» محدود می‌کند؛ هر خواندن Audit می‌شود. */
  async forAppointment(u: AuthUser, appointmentId: string) {
    return this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      const a = await tx.appointment.findFirst({ where: { id: appointmentId, doctorId: u.id }, select: { patientId: true } });
      if (!a) throw new NotFoundException();
      const row = await tx.patientHealthProfile.findUnique({ where: { patientId: a.patientId }, select: { dataEnc: true } });
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "health_profile.read", objectType: "appointment", objectId: appointmentId });
      // exists=false ⇒ «پروفایل ثبت نشده یا برای شما قابل‌مشاهده نیست»؛ هرگز معادل «بدون حساسیت» نیست.
      return { exists: !!row, ...this.decode(a.patientId, row?.dataEnc ?? null) };
    });
  }

  /** برای سرویس نسخه: فقط فهرست حساسیت‌ها، داخل همان تراکنش. */
  async allergiesIn(tx: Parameters<Parameters<PrismaService["withContext"]>[1]>[0], patientId: string): Promise<{ allergies: string[]; onFile: boolean }> {
    const row = await tx.patientHealthProfile.findUnique({ where: { patientId }, select: { dataEnc: true } });
    return { allergies: this.decode(patientId, row?.dataEnc ?? null).allergies, onFile: !!row };
  }
}
