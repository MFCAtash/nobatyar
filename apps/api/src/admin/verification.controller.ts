import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { AuditService } from "../audit/audit.service";
import { AuthUser, CurrentUser, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { AuthService } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";

const listQuery = z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED"]).default("PENDING") });
const rejectSchema = z.object({ note: z.string().trim().min(3).max(500) }).strict();

@Roles("ADMIN")
@Controller("admin/doctor-verifications")
export class VerificationController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get()
  list(@CurrentUser() a: AuthUser, @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    return this.prisma.withContext({ role: a.role, userId: a.id }, (tx) =>
      tx.doctorVerification.findMany({
        where: { status: q.status },
        orderBy: { createdAt: "asc" },
        take: 100,
        select: { id: true, doctorId: true, status: true, documentKey: true, createdAt: true, doctor: { select: { fullName: true, medicalCouncilNo: true } } },
      }),
    );
  }

  /** تأیید: فهرست‌شدن پزشک + نقش DOCTOR (در توکن بعدی/refresh بعدی اعمال می‌شود). */
  @Post(":id/approve")
  @HttpCode(200)
  approve(@CurrentUser() a: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.review(a, id, "APPROVED");
  }

  @Post(":id/reject")
  @HttpCode(200)
  reject(@CurrentUser() a: AuthUser, @Param("id", new ParseUUIDPipe()) id: string, @Body(new ZodPipe(rejectSchema)) body: { note: string }) {
    return this.review(a, id, "REJECTED", body.note);
  }

  private async review(a: AuthUser, id: string, to: "APPROVED" | "REJECTED", note?: string) {
    const result = await this.prisma.withContext({ role: a.role, userId: a.id }, async (tx) => {
      const v = await tx.doctorVerification.findUnique({ where: { id } });
      if (!v) throw new NotFoundException();
      if (v.doctorId === a.id) throw new ForbiddenException({ error: "cannot_review_own_application" });
      // به‌روزرسانی شرطی: دو ادمین هم‌زمان ⇒ فقط یکی موفق می‌شود
      const upd = await tx.doctorVerification.updateMany({
        where: { id, status: "PENDING" },
        data: { status: to, reviewedBy: a.id, reviewedAt: new Date(), note: note ?? null },
      });
      if (upd.count !== 1) throw new ConflictException({ error: "already_reviewed" });

      if (to === "APPROVED") {
        await tx.doctorProfile.update({ where: { userId: v.doctorId }, data: { isListed: true } });
        await tx.user.update({ where: { id: v.doctorId }, data: { role: "DOCTOR" } });
      }
      await this.audit.logIn(tx, {
        actorId: a.id, actorRole: a.role, action: `doctor.verification_${to.toLowerCase()}`, objectType: "doctor_verification", objectId: id,
      });
      return { id, status: to, doctorId: v.doctorId };
    });
    // نقش تغییر کرد: access token ی قدیمی (نقش PATIENT) همین حالا باطل شود؛ کلاینت با refresh توکن DOCTOR می‌گیرد
    if (to === "APPROVED") await this.auth.invalidateAccessTokensOf(result.doctorId);
    return { id: result.id, status: result.status };
  }
}
