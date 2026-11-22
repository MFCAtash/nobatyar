import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AppointmentsService } from "./appointments.service";
import { parseRRule, nextOccurrences, type RecurringRule } from "./recurring-policy";
import type { AuthUser } from "../common/decorators";
import { moduleEnabled } from "../common/feature-flags";

export interface CreateRecurringInput {
  doctorId: string;
  rrule: string;
  kind: "IN_PERSON" | "VIDEO" | "CHAT";
  firstStartsAt: string;
}

@Injectable()
export class RecurringService {
  private readonly log = new Logger(RecurringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly appointments: AppointmentsService,
  ) {}

  private requireFlag() {
    if (!moduleEnabled("FF_M3_SMART_BOOKING")) throw new BadRequestException({ error: "module_disabled" });
  }

  async create(user: AuthUser, input: CreateRecurringInput) {
    this.requireFlag();
    let rule: RecurringRule;
    try { rule = parseRRule(input.rrule); }
    catch (e) { throw new BadRequestException({ error: "invalid_rrule", message: (e as Error).message }); }

    const first = new Date(input.firstStartsAt);
    if (Number.isNaN(first.getTime())) throw new BadRequestException({ error: "invalid_starts_at" });
    const dates = nextOccurrences(first, rule);
    const seriesId = randomUUID();

    const row = await this.prisma.withContext({ role: user.role, userId: user.id }, async (tx) => {
      const doctor = await tx.doctorProfile.findFirst({
        where: { userId: input.doctorId, isListed: true }, select: { userId: true, slotMinutes: true },
      });
      if (!doctor) throw new NotFoundException({ error: "doctor_not_found" });
      return tx.recurringBooking.create({
        data: {
          patientId: user.id, doctorId: input.doctorId, seriesId, rrule: input.rrule,
          kind: input.kind, nextAt: dates[0], status: "ACTIVE",
        },
      });
    });

    return {
      id: row.id, seriesId, nextAt: row.nextAt, occurrences: 0,
      preview: dates.map((d) => ({ startsAt: d.toISOString(), endsAt: new Date(d.getTime() + 20 * 60_000).toISOString() })),
    };
  }

  async list(user: AuthUser) {
    this.requireFlag();
    return this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.recurringBooking.findMany({
        where: { patientId: user.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, seriesId: true, doctorId: true, rrule: true, kind: true, nextAt: true, status: true, occurrences: true, lastError: true },
      }),
    );
  }

  async cancel(user: AuthUser, id: string) {
    this.requireFlag();
    const row = await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.recurringBooking.findFirst({ where: { id, patientId: user.id }, select: { seriesId: true, status: true } }),
    );
    if (!row) throw new NotFoundException();
    if (row.status === "CANCELLED") return { ok: true };

    // نوبتهای آیندهٔ سری از همان مسیر لغو استاندارد عبور میکنند (refund/audit/outbox حفظ میشود).
    const future = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.appointment.findMany({
        where: { seriesId: row.seriesId, startsAt: { gt: new Date() }, status: { in: ["PENDING_PAYMENT", "PENDING_CONFIRMATION", "CONFIRMED"] } },
        select: { id: true },
      }),
    );
    for (const a of future) {
      try { await this.appointments.cancel(user, a.id); }
      catch (e) { this.log.warn(`series cancel ${a.id}: ${(e as Error).name}`); }
    }
    await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.recurringBooking.updateMany({ where: { id, status: { not: "CANCELLED" } }, data: { status: "CANCELLED" } }),
    );
    return { ok: true, cancelledAppointments: future.length };
  }

  /** توسط job دورهای فراخوانی میشود — تنها نوبت بعدی را materialize میکند. */
  async materializeDue(now: Date = new Date()): Promise<{ due: number; booked: number; failed: number }> {
    if (!moduleEnabled("FF_M3_SMART_BOOKING")) return { due: 0, booked: 0, failed: 0 };
    const due = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.recurringBooking.findMany({
        where: { status: "ACTIVE", nextAt: { lte: new Date(now.getTime() + 24 * 3_600_000) } },
        orderBy: { nextAt: "asc" }, take: 20,
      }),
    );
    let booked = 0, failed = 0;
    for (const s of due) {
      const actor: AuthUser = { id: s.patientId, role: "PATIENT", sid: `recurring:${s.id}`, iatMs: 0 };
      try {
        const appt = await this.appointments.book(actor, {
          doctorId: s.doctorId, startsAt: s.nextAt.toISOString(), kind: s.kind as "VIDEO",
        });
        await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
          tx.appointment.update({ where: { id: appt.id }, data: { seriesId: s.seriesId } }),
        );
        const rule = parseRRule(s.rrule);
        const all = nextOccurrences(new Date(s.nextAt), rule);
        const next = all.find((d) => d.getTime() > s.nextAt.getTime());
        await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
          tx.recurringBooking.updateMany({
            where: { id: s.id, nextAt: s.nextAt },
            data: next
              ? { nextAt: next, occurrences: { increment: 1 }, lastError: null }
              : { status: "EXHAUSTED", occurrences: { increment: 1 } },
          }),
        );
        booked++;
      } catch (e) {
        failed++;
        await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
          tx.recurringBooking.update({ where: { id: s.id }, data: { lastError: (e as Error).name } }),
        );
      }
    }
    this.log.log(`recurring tick: ${JSON.stringify({ due: due.length, booked, failed })}`);
    return { due: due.length, booked, failed };
  }
}
