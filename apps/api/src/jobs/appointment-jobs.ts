import { ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AppointmentsService } from "../appointments/appointments.service";
import { APPOINTMENT_NOTIFIER, AppointmentNotifier } from "../notifications/notifier";
import { PrismaService } from "../prisma/prisma.service";
import { SCHEDULING_CONFIG, SchedulingConfig } from "../scheduling/config";

const BATCH = 200;

/**
 * کارهای دوره‌ای نوبت‌ها — همه ایدمپوتنت و امن برای اجرای هم‌زمان چند نمونه:
 *  - انقضای نگه‌داشتن اسلات (پرداخت نشده) و نوبت‌های تأییدنشده
 *  - یادآوری ۲۴ ساعت و ۱ ساعت قبل از نوبت
 */
@Injectable()
export class AppointmentJobs {
  private readonly log = new Logger(AppointmentJobs.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AppointmentsService) private readonly appointments: AppointmentsService,
    @Inject(APPOINTMENT_NOTIFIER) private readonly notifier: AppointmentNotifier,
    @Inject(SCHEDULING_CONFIG) private readonly cfg: SchedulingConfig,
  ) {}

  async tick(now: Date = new Date()): Promise<{ expired: number; reminded: number }> {
    const expired = await this.expireStale(now);
    const reminded = await this.sendReminders(now);
    if (expired || reminded) this.log.log(`tick: expired=${expired} reminded=${reminded}`);
    return { expired, reminded };
  }

  async expireStale(now: Date): Promise<number> {
    const confirmCutoff = new Date(now.getTime() - this.cfg.confirmDeadlineHours * 3_600_000);
    const startCutoff = new Date(now.getTime() + this.cfg.confirmBeforeStartMinutes * 60_000);

    const rows = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.appointment.findMany({
        where: {
          OR: [
            { status: "PENDING_PAYMENT", holdExpiresAt: { lt: now } },
            { status: "PENDING_CONFIRMATION", OR: [{ createdAt: { lte: confirmCutoff } }, { startsAt: { lte: startCutoff } }] },
          ],
        },
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take: BATCH,
      }),
    );

    let n = 0;
    for (const { id } of rows) {
      try {
        await this.appointments.apply({ kind: "system" }, id, "EXPIRE", now);
        n++;
      } catch (e) {
        // تغییر هم‌زمان (پرداخت/تأیید در همین لحظه) یا حذف: بی‌خطر؛ دور بعد
        if (!(e instanceof ConflictException || e instanceof NotFoundException)) this.log.error(`expire failed for ${id}: ${(e as Error).message}`);
      }
    }
    return n;
  }

  async sendReminders(now: Date): Promise<number> {
    const in24h = new Date(now.getTime() + 24 * 3_600_000);
    const in1h = new Date(now.getTime() + 3_600_000);

    const rows = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.appointment.findMany({
        where: { status: "CONFIRMED", startsAt: { gt: now, lte: in24h }, OR: [{ reminder24SentAt: null }, { reminder1SentAt: null }] },
        select: { id: true, patientId: true, doctorId: true, startsAt: true, reminder24SentAt: true, reminder1SentAt: true },
        orderBy: { startsAt: "asc" },
        take: BATCH,
      }),
    );

    let n = 0;
    for (const a of rows) {
      const kind: "24h" | "1h" = a.startsAt <= in1h ? "1h" : "24h";
      if (kind === "1h" ? a.reminder1SentAt : a.reminder24SentAt) continue;

      // «اول ادعا، بعد ارسال»: دو نمونه‌ی هم‌زمان فقط یک یادآوری می‌فرستند؛ در خطا ادعا برگردانده می‌شود
      const claimed = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
        kind === "1h"
          ? tx.appointment.updateMany({
              where: { id: a.id, status: "CONFIRMED", reminder1SentAt: null },
              data: { reminder1SentAt: now, reminder24SentAt: a.reminder24SentAt ?? now },
            })
          : tx.appointment.updateMany({ where: { id: a.id, status: "CONFIRMED", reminder24SentAt: null }, data: { reminder24SentAt: now } }),
      );
      if (claimed.count !== 1) continue;

      try {
        await this.notifier.reminder({ appointmentId: a.id, patientId: a.patientId, doctorId: a.doctorId, startsAt: a.startsAt, kind });
        n++;
      } catch (e) {
        this.log.error(`reminder failed for ${a.id}: ${(e as Error).message}`);
        await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
          tx.appointment.updateMany({ where: { id: a.id }, data: kind === "1h" ? { reminder1SentAt: null } : { reminder24SentAt: null } }),
        );
      }
    }
    return n;
  }
}
