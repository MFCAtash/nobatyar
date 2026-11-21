import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../common/decorators";
import { PrismaService } from "../prisma/prisma.service";
import { OUTBOX_WRITER, type OutboxWriter } from "../outbox/outbox.service";
import { SCHEDULING_CONFIG, type SchedulingConfig } from "../scheduling/config";
import { formatDateStr, generateSlots, tehranDateOf, tehranLocalToUtc, type Interval } from "../scheduling/slots";
import { isExclusionViolation } from "./errors";
import { canActorReschedule, planReschedule } from "./reschedule-policy";

const sel = {
  id: true, doctorId: true, patientId: true, startsAt: true, endsAt: true, status: true,
  doctor: { select: { userId: true, slotMinutes: true, availability: { select: { weekday: true, startTime: true, endTime: true } } } },
} satisfies Prisma.AppointmentSelect;

@Injectable()
export class RescheduleService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OUTBOX_WRITER) private readonly outbox: OutboxWriter,
    @Inject(SCHEDULING_CONFIG) private readonly cfg: SchedulingConfig,
  ) {}

  async reschedule(u: AuthUser, id: string, startsAtRaw: string, now = new Date()) {
    const target = new Date(startsAtRaw);
    if (!Number.isFinite(target.getTime())) throw new BadRequestException({ error: "invalid_slot" });

    try {
      return await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
        const a = await tx.appointment.findUnique({ where: { id }, select: sel });
        if (!a) throw new NotFoundException(); // RLS: نوبت دیگری دیده نمیشود
        if (!canActorReschedule(u.id, a.patientId, a.doctorId)) throw new ForbiddenException({ error: "forbidden" });

        const plan = planReschedule({ status: a.status, startsAt: a.startsAt, endsAt: a.endsAt }, target, now, this.cfg);
        if (!plan.ok) {
          if (plan.error === "invalid_state") throw new ConflictException({ error: "invalid_state", status: a.status });
          throw new UnprocessableEntityException({ error: plan.error });
        }

        // اعتبارسنجی اسلات دقیقاً همان قواعد رزرو، منهای «خودِ نوبت» (که در appointment_busy است).
        const day = tehranDateOf(target);
        const dayStr = formatDateStr(day);
        const dayStart = tehranLocalToUtc(day, 0);
        const dayEnd = new Date(dayStart.getTime() + 86_400_000);
        const [busy, offs, mine] = await Promise.all([
          tx.appointmentBusy.findMany({
            where: { doctorId: a.doctorId, appointmentId: { not: id }, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
            select: { startsAt: true, endsAt: true },
          }),
          tx.timeOff.findMany({ where: { doctorId: a.doctorId, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } }, select: { startsAt: true, endsAt: true } }),
          tx.appointment.findMany({
            where: { patientId: a.patientId, id: { not: id }, status: { in: ["PENDING_PAYMENT", "PENDING_CONFIRMATION", "CONFIRMED"] }, endsAt: { gt: now } },
            select: { startsAt: true, endsAt: true }, take: 100,
          }),
        ]);
        const toIv = (r: { startsAt: Date; endsAt: Date }): Interval => ({ start: r.startsAt, end: r.endsAt });
        const slot = generateSlots({
          rules: a.doctor.availability, slotMinutes: a.doctor.slotMinutes, fromDate: dayStr, toDate: dayStr,
          unavailable: [...busy, ...offs].map(toIv), now, minLeadMinutes: this.cfg.minLeadMinutes, maxAdvanceDays: this.cfg.maxAdvanceDays,
        }).find((s) => s.start.getTime() === target.getTime());
        if (!slot) throw new ConflictException({ error: "slot_taken" });
        if (mine.some((m) => m.startsAt < slot.end && slot.start < m.endsAt)) throw new ConflictException({ error: "patient_time_conflict" });

        // UPDATE شرطی: زمان و وضعیت قبلی ⇒ دو جابهجایی همزمان فقط یک برنده میشود.
        // تریگر appointments_busy_sync ردیف busy را در همان تراکنش بهروز میکند.
        const upd = await tx.appointment.updateMany({
          where: { id, startsAt: a.startsAt, status: a.status },
          data: { startsAt: slot.start, endsAt: slot.end, reminder24SentAt: null, reminder1SentAt: null },
        });
        if (upd.count !== 1) throw new ConflictException({ error: "concurrent_modification" });

        await this.audit.logIn(tx, {
          actorId: u.id, actorRole: u.role, action: "appointment.rescheduled", objectType: "appointment", objectId: id,
          meta: { from: a.startsAt.toISOString(), to: slot.start.toISOString() },
        });
        // رویداد فقط شناسه و زمانها (بدون داده سلامت) — همان تراکنش ⇒ اعلان و نوبت ناسازگار نمیشوند.
        await this.outbox.enqueue(tx, {
          type: "appointment.rescheduled", aggregateType: "appointment", aggregateId: id,
          payload: { appointmentId: id, patientId: a.patientId, doctorId: a.doctorId, from: a.startsAt.toISOString(), to: slot.start.toISOString(), actorId: u.id },
        });
        return { id, startsAt: slot.start, endsAt: slot.end, status: a.status, refundRial: "0" };
      });
    } catch (e) {
      if (isExclusionViolation(e)) throw new ConflictException({ error: "slot_taken" });
      throw e;
    }
  }
}
