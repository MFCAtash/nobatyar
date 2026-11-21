import { Body, Controller, Get, HttpCode, Inject, NotFoundException, Param, Patch, Post } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { AuthUser, CurrentUser } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { aad, FIELD_CRYPTO, FieldCrypto } from "../crypto";
import { PrismaService } from "../prisma/prisma.service";
import { consentTypeParamSchema, grantConsentSchema, updateProfileSchema } from "./me.schemas";

type ConsentType = (typeof import("./me.schemas").CONSENT_TYPES)[number];

/** 98912XXXX4567 → 0912***4567 */
export const maskPhone = (p: string): string => `0${p.slice(2, 5)}***${p.slice(-4)}`;

@Controller("me")
export class MeController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
  ) {}

  @Get()
  async me(@CurrentUser() u: AuthUser) {
    const row = await this.prisma.withContext({ role: u.role, userId: u.id }, (tx) =>
      tx.user.findUnique({
        where: { id: u.id },
        select: { id: true, role: true, phoneEnc: true, createdAt: true, patient: { select: { fullName: true } }, doctor: { select: { fullName: true, isListed: true } } },
      }),
    );
    if (!row) throw new NotFoundException();
    return {
      id: row.id,
      role: row.role,
      phoneMasked: maskPhone(this.crypto.decryptString(row.phoneEnc, aad("users", row.id, "phone"))),
      fullName: row.doctor?.fullName || row.patient?.fullName || "",
      doctor: row.doctor ? { isListed: row.doctor.isListed } : null,
      createdAt: row.createdAt,
    };
  }

  @Patch("profile")
  async updateProfile(@CurrentUser() u: AuthUser, @Body(new ZodPipe(updateProfileSchema)) body: { fullName: string }) {
    await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      await tx.patientProfile.upsert({ where: { userId: u.id }, update: { fullName: body.fullName }, create: { userId: u.id, fullName: body.fullName } });
      if (u.role === "DOCTOR") await tx.doctorProfile.update({ where: { userId: u.id }, data: { fullName: body.fullName } });
    });
    return { status: "ok" };
  }

  @Get("consents")
  consents(@CurrentUser() u: AuthUser) {
    return this.prisma.withContext({ role: u.role, userId: u.id }, (tx) =>
      tx.consent.findMany({ where: { userId: u.id }, orderBy: { grantedAt: "desc" }, select: { type: true, version: true, grantedAt: true, revokedAt: true } }),
    );
  }

  /** ایدمپوتنت: اگر همان نوع و نسخه فعال است، چیزی اضافه نمی‌شود. */
  @Post("consents")
  @HttpCode(200)
  async grant(@CurrentUser() u: AuthUser, @Body(new ZodPipe(grantConsentSchema)) body: { type: ConsentType; version: string }) {
    return this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      const active = await tx.consent.findFirst({ where: { userId: u.id, type: body.type, version: body.version, revokedAt: null } });
      if (active) return { status: "already_granted" };
      await tx.consent.create({ data: { userId: u.id, type: body.type, version: body.version } });
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "consent.granted", objectType: "consent", objectId: body.type, meta: { version: body.version } });
      return { status: "granted" };
    });
  }

  @Post("consents/:type/revoke")
  @HttpCode(200)
  async revoke(@CurrentUser() u: AuthUser, @Param("type", new ZodPipe(consentTypeParamSchema)) type: ConsentType) {
    return this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      const r = await tx.consent.updateMany({ where: { userId: u.id, type, revokedAt: null }, data: { revokedAt: new Date() } });
      if (r.count > 0) await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "consent.revoked", objectType: "consent", objectId: type });
      return { status: "revoked", count: r.count };
    });
  }
}
