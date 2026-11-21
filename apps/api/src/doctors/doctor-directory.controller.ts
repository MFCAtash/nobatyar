import { BadRequestException, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { Public } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { SCHEDULING_CONFIG, SchedulingConfig } from "../scheduling/config";
import { formatDateStr, generateSlots, Interval, parseDateStr, tehranDateOf, tehranLocalToUtc } from "../scheduling/slots";
import { rankSlots } from "../scheduling/ranking";
import { moduleEnabled } from "../common/feature-flags";

const searchSchema = z.object({
  q: z.string().trim().min(2).max(50).optional(),
  specialty: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const slotsSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** M3: پیشنهادهای رتبهبندیشده — پشت feature flag سرور. */
  ranked: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

const publicSelect = {
  userId: true, fullName: true, bio: true, consultationFeeRial: true, slotMinutes: true,
  /// فاز ۱۹: مکان نوبت حضوری (اطلاعات عمومی مطب)
  clinicName: true, clinicAddress: true, clinicPhone: true,
  specialties: { select: { specialty: { select: { slug: true, nameFa: true } } } },
} satisfies Prisma.DoctorProfileSelect;

const presentDoctor = (d: Prisma.DoctorProfileGetPayload<{ select: typeof publicSelect }>) => ({
  id: d.userId,
  fullName: d.fullName,
  bio: d.bio,
  consultationFeeRial: d.consultationFeeRial.toString(),
  slotMinutes: d.slotMinutes,
  clinic: d.clinicName || d.clinicAddress ? { name: d.clinicName, address: d.clinicAddress, phone: d.clinicPhone } : null,
  specialties: d.specialties.map((s) => s.specialty),
});

@Controller("specialties")
export class SpecialtiesController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  list() {
    return this.prisma.withContext({ role: "ANON" }, (tx) => tx.specialty.findMany({ orderBy: { nameFa: "asc" }, select: { slug: true, nameFa: true } }));
  }
}

/** دایرکتوری عمومی پزشکان — فقط پزشکان فهرست‌شده (isListed) و فقط فیلدهای عمومی. */
@Controller("doctors")
export class DoctorDirectoryController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SCHEDULING_CONFIG) private readonly cfg: SchedulingConfig,
  ) {}

  @Public()
  @Get()
  async search(@Query(new ZodPipe(searchSchema)) q: z.infer<typeof searchSchema>) {
    const where: Prisma.DoctorProfileWhereInput = {
      isListed: true,
      ...(q.q ? { fullName: { contains: q.q, mode: "insensitive" } } : {}),
      ...(q.specialty ? { specialties: { some: { specialty: { slug: q.specialty } } } } : {}),
    };
    const [total, rows] = await this.prisma.withContext({ role: "ANON" }, async (tx) => [
      await tx.doctorProfile.count({ where }),
      await tx.doctorProfile.findMany({ where, select: publicSelect, orderBy: [{ fullName: "asc" }, { userId: "asc" }], skip: (q.page - 1) * q.limit, take: q.limit }),
    ] as const);
    return { total, page: q.page, limit: q.limit, items: rows.map(presentDoctor) };
  }

  @Public()
  @Get(":id")
  async one(@Param("id", new ParseUUIDPipe()) id: string) {
    const d = await this.prisma.withContext({ role: "ANON" }, (tx) => tx.doctorProfile.findFirst({ where: { userId: id, isListed: true }, select: publicSelect }));
    if (!d) throw new NotFoundException({ error: "doctor_not_found" });
    return presentDoctor(d);
  }

  /** اسلات‌های آزاد؛ from/to به تاریخ محلی تهران (YYYY-MM-DD)، حداکثر ۱۴ روز. */
  @Public()
  @Get(":id/slots")
  async slots(@Param("id", new ParseUUIDPipe()) id: string, @Query(new ZodPipe(slotsSchema)) q: z.infer<typeof slotsSchema>) {
    const now = new Date();
    const today = formatDateStr(tehranDateOf(now));
    let from: string, to: string;
    try {
      from = q.from ?? today;
      const f = parseDateStr(from);
      to = q.to ?? formatDateStr(tehranDateOf(new Date(tehranLocalToUtc(f, 0).getTime() + 6 * 86_400_000)));
      const span = (Date.UTC(...ymd(parseDateStr(to))) - Date.UTC(...ymd(f))) / 86_400_000;
      if (span < 0 || span > 13) throw new Error("range must be 1..14 days");
    } catch (e) {
      throw new BadRequestException({ error: "invalid_range", message: (e as Error).message });
    }

    const rangeStart = tehranLocalToUtc(parseDateStr(from), 0);
    const rangeEnd = new Date(tehranLocalToUtc(parseDateStr(to), 0).getTime() + 86_400_000);

    const data = await this.prisma.withContext({ role: "ANON" }, async (tx) => {
      const doc = await tx.doctorProfile.findFirst({
        where: { userId: id, isListed: true },
        select: { slotMinutes: true, availability: { select: { weekday: true, startTime: true, endTime: true } } },
      });
      if (!doc) return null;
      const busy = await tx.appointmentBusy.findMany({ where: { doctorId: id, startsAt: { lt: rangeEnd }, endsAt: { gt: rangeStart } }, select: { startsAt: true, endsAt: true } });
      const offs = await tx.timeOff.findMany({ where: { doctorId: id, startsAt: { lt: rangeEnd }, endsAt: { gt: rangeStart } }, select: { startsAt: true, endsAt: true } });
      return { doc, unavailable: [...busy, ...offs].map((r): Interval => ({ start: r.startsAt, end: r.endsAt })) };
    });
    if (!data) throw new NotFoundException({ error: "doctor_not_found" });

    const slots = generateSlots({
      rules: data.doc.availability, slotMinutes: data.doc.slotMinutes, fromDate: from, toDate: to,
      unavailable: data.unavailable, now, minLeadMinutes: this.cfg.minLeadMinutes, maxAdvanceDays: this.cfg.maxAdvanceDays,
    });
    const base = {
      timezone: "Asia/Tehran",
      slotMinutes: data.doc.slotMinutes,
      slots: slots.map((s) => ({ startsAt: s.start, endsAt: s.end })),
    };
    if (!q.ranked || !moduleEnabled("FF_M3_SMART_BOOKING")) return base;

    // بار پزشک فقط از نمای بدون-PHI appointment_busy شمارش میشود.
    const dayLoad: Record<string, number> = {};
    for (const s of slots) {
      const shifted = new Date(s.start.getTime() + 210 * 60_000);
      const key = shifted.toISOString().slice(0, 10);
      dayLoad[key] = (dayLoad[key] ?? 0) + 1;
    }
    return {
      ...base,
      ranked: true as const,
      suggestions: rankSlots(slots, { now, dayLoad }, q.limit),
    };
  }
}

const ymd = (t: { y: number; m: number; d: number }): [number, number, number] => [t.y, t.m - 1, t.d];
