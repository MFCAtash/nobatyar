import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { FIELD_CRYPTO, FieldCrypto, aad } from "../crypto";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../common/decorators";

export { FamilyMemberSchema } from "./family.schemas";
export type { FamilyMemberInput } from "./family.schemas";
import type { FamilyMemberInput } from "./family.schemas";

/**
 * AAD ی کد ملی عضو خانواده: «جدول + شناسه‌ی عضو + ستون».
 * (پیش‌تر رمزنگاری با aad("family-national-id", userId) و رمزگشایی با aad("family", memberId) انجام می‌شد ⇒ AAD ناهمخوان،
 *  هر رمزگشایی شکست می‌خورد و لیست خانواده خطای ۵۰۰ می‌داد؛ ضمناً aad سه پارامتر می‌خواهد و tsc خطا می‌داد.)
 */
export const nationalIdAad = (memberId: string): string => aad("family_members", memberId, "national_id");

@Injectable()
export class FamilyService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FIELD_CRYPTO)  private readonly crypto:  FieldCrypto,
  ) {}

  async list(user: AuthUser) {
    const members = await this.prisma.familyMember.findMany({
      where:   { ownerId: user.id },
      orderBy: { createdAt: "asc" },
      select:  { id: true, fullName: true, relation: true, birthYear: true,
                 nationalId: true, createdAt: true },
    });
    return Promise.all(members.map(async (m) => ({
      id:         m.id,
      fullName:   m.fullName,
      relation:   m.relation,
      birthYear:  m.birthYear,
      /** کد ملی رمزگشایی می‌شود فقط برای نمایش مالک — پیش از ارسال به client ماسک می‌شود */
      nationalIdMasked: m.nationalId
        ? this.maskNationalId(m.nationalId, m.id)
        : null,
      createdAt: m.createdAt,
    })));
  }

  async add(user: AuthUser, dto: FamilyMemberInput) {
    const id = randomUUID(); // AAD به شناسه‌ی عضو وابسته است ⇒ پیش از درج ساخته می‌شود
    let nationalIdEnc: Buffer | undefined;
    if (dto.nationalId) {
      nationalIdEnc = this.crypto.encrypt(Buffer.from(dto.nationalId, "utf-8"), nationalIdAad(id));
    }
    return this.prisma.familyMember.create({
      data: {
        id,
        ownerId:    user.id,
        fullName:   dto.fullName,
        relation:   dto.relation,
        birthYear:  dto.birthYear,
        nationalId: nationalIdEnc,
      },
      select: { id: true, fullName: true, relation: true, birthYear: true, createdAt: true },
    });
  }

  /** رمزگشایی ناموفق (داده‌ی قدیمیِ ناهمخوان) ⇒ null؛ یک رکورد خراب نباید کل لیست را ۵۰۰ کند. */
  private maskNationalId(enc: Uint8Array, memberId: string): string | null {
    try { return this.crypto.decrypt(enc, nationalIdAad(memberId)).toString("utf-8").replace(/^(.{6})/, "****"); } catch { return null; }
  }

  async remove(user: AuthUser, id: string) {
    const m = await this.prisma.familyMember.findUnique({ where: { id } });
    if (!m)                throw new NotFoundException();
    if (m.ownerId !== user.id) throw new ForbiddenException();
    await this.prisma.familyMember.delete({ where: { id } });
    return { deleted: true };
  }

  async update(user: AuthUser, id: string, dto: Partial<FamilyMemberInput>) {
    const m = await this.prisma.familyMember.findUnique({ where: { id } });
    if (!m)                throw new NotFoundException();
    if (m.ownerId !== user.id) throw new ForbiddenException();

    let nationalIdEnc: Buffer | undefined;
    if (dto.nationalId) {
      nationalIdEnc = this.crypto.encrypt(Buffer.from(dto.nationalId, "utf-8"), nationalIdAad(id));
    }

    return this.prisma.familyMember.update({
      where:  { id },
      data: {
        fullName:   dto.fullName,
        relation:   dto.relation,
        birthYear:  dto.birthYear,
        ...(nationalIdEnc ? { nationalId: nationalIdEnc } : {}),
      },
      select: { id: true, fullName: true, relation: true, birthYear: true, createdAt: true },
    });
  }
}
