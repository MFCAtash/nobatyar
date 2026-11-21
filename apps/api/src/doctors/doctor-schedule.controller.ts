import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put } from "@nestjs/common";
import { z } from "zod";
import { AuditService } from "../audit/audit.service";
import { AuthUser, CurrentUser, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { validateAvailability } from "../scheduling/slots";

const ruleSchema = z.object({ weekday: z.number().int().min(0).max(6), startTime: z.string(), endTime: z.string() }).strict();
const availabilitySchema = z.object({ rules: z.array(ruleSchema).max(70) }).strict();

export const settingsSchema = z
  .object({
    slotMinutes: z.number().int().min(10).max(60).refine((n) => n % 5 === 0, "must be a multiple of 5").optional(),
    autoConfirm: z.boolean().optional(),
    consultationFeeRial: z.string().regex(/^\d{1,12}$/).transform((s) => BigInt(s)).optional(),
    bio: z.string().trim().max(2000).optional(),
    /// فاز ۱۹: اطلاعات عمومی مطب (برای نوبت حضوری) — داده سلامت محسوب نمیشود
    clinicName: z.string().trim().min(2).max(120).optional(),
    clinicAddress: z.string().trim().min(5).max(500).optional(),
    clinicPhone: z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/).optional(),
  })
  .strict();

const timeOffSchema = z
  .object({
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    reason: z.string().trim().max(200).optional(),
  })
  .strict();

const specialtiesSchema = z.object({ slugs: z.array(z.string().regex(/^[a-z0-9-]{1,40}$/)).min(1).max(3) }).strict();

/** مدیریت برنامه‌ی کاری توسط خود پزشک (RLS: فقط ردیف‌های خودش). */
@Roles("DOCTOR")
@Controller("doctors/me")
export class DoctorScheduleController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private ctx(u: AuthUser) {
    return { role: u.role, userId: u.id } as const;
  }

  @Get("availability")
  async getAvailability(@CurrentUser() u: AuthUser) {
    return this.prisma.withContext(this.ctx(u), async (tx) => {
      const d = await tx.doctorProfile.findUnique({
        where: { userId: u.id },
        select: {
          slotMinutes: true, autoConfirm: true, consultationFeeRial: true, bio: true,
          clinicName: true, clinicAddress: true, clinicPhone: true,
          availability: { select: { weekday: true, startTime: true, endTime: true }, orderBy: [{ weekday: "asc" }, { startTime: "asc" }] },
        },
      });
      if (!d) throw new NotFoundException();
      return {
        settings: {
          slotMinutes: d.slotMinutes, autoConfirm: d.autoConfirm, consultationFeeRial: d.consultationFeeRial.toString(), bio: d.bio,
          clinicName: d.clinicName, clinicAddress: d.clinicAddress, clinicPhone: d.clinicPhone,
        },
        rules: d.availability,
      };
    });
  }

  /** جایگزینی کامل برنامه‌ی هفتگی. نوبت‌های موجود تغییر نمی‌کنند. */
  @Put("availability")
  async setAvailability(@CurrentUser() u: AuthUser, @Body(new ZodPipe(availabilitySchema)) body: z.infer<typeof availabilitySchema>) {
    return this.prisma.withContext(this.ctx(u), async (tx) => {
      const d = await tx.doctorProfile.findUnique({ where: { userId: u.id }, select: { slotMinutes: true } });
      if (!d) throw new NotFoundException();
      const issues = validateAvailability(body.rules, d.slotMinutes);
      if (issues.length) throw new BadRequestException({ error: "invalid_availability", issues });
      await tx.availabilityRule.deleteMany({ where: { doctorId: u.id } });
      if (body.rules.length) await tx.availabilityRule.createMany({ data: body.rules.map((r) => ({ ...r, doctorId: u.id })) });
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "doctor.availability_updated", objectType: "doctor", objectId: u.id, meta: { rules: body.rules.length } });
      return { status: "ok", rules: body.rules.length };
    });
  }

  @Patch("settings")
  async settings(@CurrentUser() u: AuthUser, @Body(new ZodPipe(settingsSchema)) body: z.infer<typeof settingsSchema>) {
    return this.prisma.withContext(this.ctx(u), async (tx) => {
      if (body.slotMinutes !== undefined) {
        const rules = await tx.availabilityRule.findMany({ where: { doctorId: u.id }, select: { weekday: true, startTime: true, endTime: true } });
        const issues = validateAvailability(rules, body.slotMinutes);
        if (issues.length) throw new ConflictException({ error: "availability_incompatible_with_slot_minutes", issues });
      }
      await tx.doctorProfile.update({ where: { userId: u.id }, data: body });
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "doctor.settings_updated", objectType: "doctor", objectId: u.id, meta: { fields: Object.keys(body) } });
      return { status: "ok" };
    });
  }

  @Put("specialties")
  async specialties(@CurrentUser() u: AuthUser, @Body(new ZodPipe(specialtiesSchema)) body: z.infer<typeof specialtiesSchema>) {
    return this.prisma.withContext(this.ctx(u), async (tx) => {
      const found = await tx.specialty.findMany({ where: { slug: { in: body.slugs } }, select: { id: true } });
      if (found.length !== new Set(body.slugs).size) throw new BadRequestException({ error: "unknown_specialty" });
      await tx.doctorSpecialty.deleteMany({ where: { doctorId: u.id } });
      await tx.doctorSpecialty.createMany({ data: found.map((s) => ({ doctorId: u.id, specialtyId: s.id })) });
      return { status: "ok" };
    });
  }

  @Get("time-off")
  list(@CurrentUser() u: AuthUser) {
    return this.prisma.withContext(this.ctx(u), (tx) =>
      tx.timeOff.findMany({ where: { doctorId: u.id, endsAt: { gt: new Date() } }, orderBy: { startsAt: "asc" }, select: { id: true, startsAt: true, endsAt: true, reason: true } }),
    );
  }

  /** مرخصی: اگر نوبت فعالی در بازه هست رد می‌شود (پزشک باید ابتدا آن‌ها را لغو کند تا بازپرداخت درست انجام شود). */
  @Post("time-off")
  async addTimeOff(@CurrentUser() u: AuthUser, @Body(new ZodPipe(timeOffSchema)) body: z.infer<typeof timeOffSchema>) {
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    if (!(endsAt > startsAt) || endsAt.getTime() - startsAt.getTime() > 30 * 86_400_000) throw new BadRequestException({ error: "invalid_range" });
    if (endsAt <= new Date()) throw new BadRequestException({ error: "range_in_past" });

    return this.prisma.withContext(this.ctx(u), async (tx) => {
      const conflicts = await tx.appointmentBusy.count({ where: { doctorId: u.id, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } });
      if (conflicts > 0) throw new ConflictException({ error: "active_appointments_in_range", count: conflicts });
      const t = await tx.timeOff.create({ data: { doctorId: u.id, startsAt, endsAt, reason: body.reason }, select: { id: true } });
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "doctor.time_off_added", objectType: "time_off", objectId: t.id });
      return t;
    });
  }

  @Delete("time-off/:id")
  @HttpCode(204)
  async removeTimeOff(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    await this.prisma.withContext(this.ctx(u), async (tx) => {
      const r = await tx.timeOff.deleteMany({ where: { id, doctorId: u.id } });
      if (r.count === 0) throw new NotFoundException();
    });
  }
}
