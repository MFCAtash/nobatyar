import {
  BadRequestException, Controller, Get, Query, UseGuards,
} from "@nestjs/common";
import { JwtGuard } from "../auth/guards";
import { PrismaService } from "../prisma/prisma.service";
import { Inject } from "@nestjs/common";

/** مقایسه حداکثر ۳ پزشک کنار هم */
@Controller("doctors/compare")
@UseGuards(JwtGuard)
export class CompareController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * GET /doctors/compare?ids=uuid1,uuid2,uuid3
   * برمی‌گرداند: آرایه‌ای از پروفایل‌های کامل برای نمایش جدول مقایسه
   */
  @Get()
  async compare(@Query("ids") ids: string) {
    const list = (ids ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (list.length < 2)    throw new BadRequestException("حداقل ۲ پزشک برای مقایسه لازم است");
    if (list.length > 3)    throw new BadRequestException("حداکثر ۳ پزشک قابل مقایسه است");

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (list.some((id) => !uuidRe.test(id))) throw new BadRequestException("شناسه نامعتبر");

    const doctors = await this.prisma.doctorProfile.findMany({
      where:  { userId: { in: list } },
      select: {
        userId:             true,
        fullName:           true,
        bio:                true,
        consultationFeeRial:true,
        slotMinutes:        true,
        clinicName:         true,
        clinicAddress:      true,
        clinicPhone:        true,
        specialties: {
          select: { specialty: { select: { slug: true, nameFa: true } } },
        },
        availability: {
          select: { weekday: true, startTime: true, endTime: true },
        },
      },
    });

    if (doctors.length !== list.length) throw new BadRequestException("برخی شناسه‌ها یافت نشدند");

    // حفظ ترتیب ورودی
    const ordered = list.map((id) => doctors.find((d) => d.userId === id)!);

    return ordered.map((d) => ({
      id:                  d.userId,
      fullName:            d.fullName,
      bio:                 d.bio,
      consultationFeeRial: d.consultationFeeRial.toString(),
      slotMinutes:         d.slotMinutes,
      clinicName:          d.clinicName,
      clinicAddress:       d.clinicAddress,
      clinicPhone:         d.clinicPhone,
      specialties:         d.specialties.map((s) => s.specialty),
      workDays:            d.availability.map((r) => r.weekday),
    }));
  }
}
