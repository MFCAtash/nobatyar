import { BadRequestException, Body, ConflictException, Controller, Get, Inject, Post } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AuditService } from "../audit/audit.service";
import { AuthUser, CurrentUser, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { toAsciiDigits } from "../crypto";
import { PrismaService } from "../prisma/prisma.service";

const applySchema = z
  .object({
    fullName: z.string().trim().min(2).max(100),
    medicalCouncilNo: z.string().transform(toAsciiDigits).pipe(z.string().regex(/^\d{3,10}$/, "invalid medical council number")),
    /** کلید شیء آپلود‌شده در MinIO (آپلود امن در فاز ۶)؛ فقط زیر پیشوند خود کاربر مجاز است. */
    documentKey: z.string().min(5).max(300),
  })
  .strict();

@Controller("doctors/applications")
export class DoctorApplicationController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Roles("PATIENT")
  @Post()
  async apply(@CurrentUser() u: AuthUser, @Body(new ZodPipe(applySchema)) body: z.infer<typeof applySchema>) {
    if (!body.documentKey.startsWith(`verification/${u.id}/`) || body.documentKey.includes("..")) {
      throw new BadRequestException({ error: "invalid_document_key" });
    }
    try {
      return await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
        const pending = await tx.doctorVerification.findFirst({ where: { doctorId: u.id, status: "PENDING" } });
        if (pending) throw new ConflictException({ error: "application_pending" });

        // پروفایل پزشک تا زمان تأیید فهرست نمی‌شود (isListed=false)
        await tx.doctorProfile.upsert({
          where: { userId: u.id },
          update: { fullName: body.fullName, medicalCouncilNo: body.medicalCouncilNo },
          create: { userId: u.id, fullName: body.fullName, medicalCouncilNo: body.medicalCouncilNo },
        });
        const v = await tx.doctorVerification.create({ data: { doctorId: u.id, documentKey: body.documentKey } });
        await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "doctor.application_submitted", objectType: "doctor_verification", objectId: v.id });
        return { id: v.id, status: v.status };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException({ error: "medical_council_no_in_use" });
      }
      throw e;
    }
  }

  @Roles("PATIENT", "DOCTOR")
  @Get("mine")
  mine(@CurrentUser() u: AuthUser) {
    return this.prisma.withContext({ role: u.role, userId: u.id }, (tx) =>
      tx.doctorVerification.findMany({ where: { doctorId: u.id }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, note: true, createdAt: true, reviewedAt: true } }),
    );
  }
}
