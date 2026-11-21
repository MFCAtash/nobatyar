import { setSpanAttributes, withSpan } from "../observability/tracing";
import { randomUUID } from "node:crypto";
import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger,
  NotFoundException, Optional, UnprocessableEntityException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { Role } from "@nobatyar/shared";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../common/decorators";
import { aad, FIELD_CRYPTO, FieldCrypto } from "../crypto";
import { PrismaService } from "../prisma/prisma.service";
import { OUTBOX_WRITER, type OutboxWriter } from "../outbox/outbox.service";
import { ACTION_ACTOR, Action, computeRefund, planAction, Status } from "../scheduling/actions";
import { SCHEDULING_CONFIG, SchedulingConfig } from "../scheduling/config";
import { formatDateStr, generateSlots, Interval, tehranDateOf, tehranLocalToUtc } from "../scheduling/slots";
import { scoreNoShow } from "../scheduling/no-show-risk";
import { isExclusionViolation } from "./errors";
import { APPOINTMENT_LIFECYCLE, AppointmentLifecycleHook } from "./lifecycle";
import { WaitlistService } from "./waitlist.service";
import type { BookInput, ListInput } from "./schemas";

export type Actor = { kind: "user"; id: string; role: Role } | { kind: "system" };

const ACTIVE: Status[] = ["PENDING_PAYMENT", "PENDING_CONFIRMATION", "CONFIRMED", "IN_PROGRESS"];
const OPEN: Status[] = ["PENDING_PAYMENT", "PENDING_CONFIRMATION", "CONFIRMED"];
/** اقدام‌هایی که نوبت را به وضعیت پایانی می‌برند (قلاب بستن اتاق ویدئو). */
const FINISHING: Action[] = ["COMPLETE", "DOCTOR_CANCEL", "PATIENT_CANCEL", "REPORT_PATIENT_NO_SHOW", "REPORT_DOCTOR_NO_SHOW", "EXPIRE"];

const view = {
  id: true, doctorId: true, patientId: true, startsAt: true, endsAt: true, status: true, kind: true,
  priceRial: true, holdExpiresAt: true, createdAt: true,
  doctor: { select: { fullName: true, clinicName: true, clinicAddress: true, clinicPhone: true } },
  patient: { select: { fullName: true } },
} satisfies Prisma.AppointmentSelect;

type Row = Prisma.AppointmentGetPayload<{ select: typeof view }>;

const present = (a: Row) => ({
  id: a.id,
  doctor: {
    id: a.doctorId, fullName: a.doctor.fullName,
    clinic: a.doctor.clinicName || a.doctor.clinicAddress
      ? { name: a.doctor.clinicName, address: a.doctor.clinicAddress, phone: a.doctor.clinicPhone }
      : null,
  },
  patient: { id: a.patientId, fullName: a.patient.fullName },
  startsAt: a.startsAt,
  endsAt: a.endsAt,
  status: a.status,
  kind: a.kind,
  priceRial: a.priceRial.toString(),
  holdExpiresAt: a.holdExpiresAt,
});

@Injectable()
export class AppointmentsService {
  private readonly log = new Logger(AppointmentsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
    @Inject(SCHEDULING_CONFIG) private readonly cfg: SchedulingConfig,
    @Inject(OUTBOX_WRITER) private readonly outbox: OutboxWriter,
    @Inject(WaitlistService) private readonly waitlist: WaitlistService,
    @Optional() @Inject(APPOINTMENT_LIFECYCLE) private readonly lifecycle?: AppointmentLifecycleHook,
  ) {}

  // ───────────── رزرو ─────────────
  /** رزرو نوبت — span ی «booking.create» (فقط نوع ویزیت؛ بدون داده‌ی بیمار). */
  book(user: AuthUser, dto: BookInput) {
    return withSpan("booking.create", { "appointment.kind": dto.kind }, async (span) => {
      const r = await this.bookInner(user, dto);
      setSpanAttributes(span, { "appointment.id": (r as { id?: string })?.id });
      return r;
    });
  }

  private async bookInner(user: AuthUser, dto: BookInput) {
    const now = new Date();
    const startsAt = new Date(dto.startsAt);
    const id = randomUUID();

    try {
      return await this.prisma.withContext({ role: user.role, userId: user.id }, async (tx) => {
        const doc = await tx.doctorProfile.findUnique({
          where: { userId: dto.doctorId },
          select: {
            userId: true, isListed: true, slotMinutes: true, autoConfirm: true, consultationFeeRial: true,
            availability: { select: { weekday: true, startTime: true, endTime: true } },
          },
        });
        if (!doc || !doc.isListed) throw new NotFoundException({ error: "doctor_not_found" });
        if (doc.userId === user.id) throw new ForbiddenException({ error: "cannot_book_self" });

        // ۱) آیا زمان درخواستی دقیقاً یک اسلات معتبر و آزاد است؟
        const day = tehranDateOf(startsAt);
        const dayStr = formatDateStr(day);
        const dayStart = tehranLocalToUtc(day, 0);
        const dayEnd = new Date(dayStart.getTime() + 86_400_000);
        const busy = await tx.appointmentBusy.findMany({
          where: { doctorId: doc.userId, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
          select: { startsAt: true, endsAt: true },
        });
        const offs = await tx.timeOff.findMany({
          where: { doctorId: doc.userId, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
          select: { startsAt: true, endsAt: true },
        });
        const toIv = (r: { startsAt: Date; endsAt: Date }): Interval => ({ start: r.startsAt, end: r.endsAt });
        const common = {
          rules: doc.availability, slotMinutes: doc.slotMinutes, fromDate: dayStr, toDate: dayStr,
          now, minLeadMinutes: this.cfg.minLeadMinutes, maxAdvanceDays: this.cfg.maxAdvanceDays,
        };
        const same = (s: Interval) => s.start.getTime() === startsAt.getTime();
        const slot = generateSlots({ ...common, unavailable: [...busy, ...offs].map(toIv) }).find(same);
        if (!slot) {
          const ignoringBusy = generateSlots({ ...common, unavailable: offs.map(toIv) }).find(same);
          throw ignoringBusy
            ? new ConflictException({ error: "slot_taken" })
            : new BadRequestException({ error: "invalid_slot" });
        }

        // ۲) محدودیت‌های بیمار: سقف نوبت باز و تداخل زمانی
        const mine = await tx.appointment.findMany({
          where: { patientId: user.id, status: { in: OPEN }, endsAt: { gt: now } },
          select: { startsAt: true, endsAt: true },
          take: 100,
        });
        if (mine.length >= this.cfg.maxOpenPerPatient) throw new ConflictException({ error: "too_many_open_appointments" });
        if (mine.some((m) => m.startsAt < slot.end && slot.start < m.endsAt)) {
          throw new ConflictException({ error: "patient_time_conflict" });
        }

        // ۳) ایجاد نوبت — قید EXCLUDE دیتابیس مرجع نهایی ضد رزرو دوبل است
        const needsPayment = doc.consultationFeeRial > 0n;
        const status: Status = needsPayment ? "PENDING_PAYMENT" : doc.autoConfirm ? "CONFIRMED" : "PENDING_CONFIRMATION";
        const created = await tx.appointment.create({
          data: {
            id, doctorId: doc.userId, patientId: user.id,
            startsAt: slot.start, endsAt: slot.end, status, kind: dto.kind,
            priceRial: doc.consultationFeeRial,
            holdExpiresAt: needsPayment ? new Date(now.getTime() + this.cfg.holdMinutes * 60_000) : null,
            reasonEnc: dto.reason ? this.crypto.encrypt(dto.reason, aad("appointments", id, "reason")) : undefined,
          },
          select: view,
        });
        await tx.appointmentStatusHistory.create({ data: { appointmentId: id, fromStatus: null, toStatus: status, actorId: user.id } });
        // مکالمه‌ی چت هر نوبت (۱:۱). بدون این رکورد هیچ مسیری برای چت بیمار↔پزشک وجود ندارد؛ پیام‌ها جدا و رمزنگاری‌شده‌اند.
        await tx.conversation.create({ data: { appointmentId: id, patientId: user.id, doctorId: doc.userId } });
        await this.audit.logIn(tx, { actorId: user.id, actorRole: user.role, action: "appointment.booked", objectType: "appointment", objectId: id });
        return present(created);
      });
    } catch (e) {
      if (isExclusionViolation(e)) throw new ConflictException({ error: "slot_taken" });
      throw e;
    }
  }

  // ───────────── خواندن ─────────────
  async list(user: AuthUser, q: ListInput) {
    const where: Prisma.AppointmentWhereInput = {
      ...(user.role === "PATIENT" ? { patientId: user.id } : user.role === "DOCTOR" ? { doctorId: user.id } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.from || q.to ? { startsAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } } : {}),
    };
    const rows = await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.appointment.findMany({
        where, select: view, take: q.limit + 1,
        orderBy: [{ startsAt: "desc" }, { id: "desc" }],
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      }),
    );
    const page = rows.slice(0, q.limit);
    return { items: page.map(present), nextCursor: rows.length > q.limit ? page[page.length - 1].id : null };
  }

  /** جزئیات؛ «دلیل مراجعه» فقط برای خود بیمار و پزشک همین نوبت رمزگشایی می‌شود (ادمین نه). */
  async get(user: AuthUser, id: string) {
    const a = await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.appointment.findUnique({ where: { id }, select: { ...view, reasonEnc: true } }),
    );
    if (!a) throw new NotFoundException();
    const participant = user.id === a.patientId || user.id === a.doctorId;
    const reason = participant && a.reasonEnc ? this.crypto.decryptString(a.reasonEnc, aad("appointments", id, "reason")) : null;
    return { ...present(a), reason };
  }

  /** A11: امتیازدهی توضیحپذیر غیبت فقط برای یادآوری هدفمند (هرگز تصمیم بالینی/مالی). */
  async scoreRisks(now = new Date()) {
    const hourFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tehran", hour: "2-digit", hourCycle: "h23" });
    const rows = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.appointment.findMany({
        where: { status: "CONFIRMED", startsAt: { gte: now, lt: new Date(now.getTime() + 7 * 86_400_000) } },
        select: { id: true, patientId: true, startsAt: true, kind: true }, take: 500,
      }),
    );
    let scored = 0;
    for (const a of rows) {
      const prior = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
        tx.appointment.count({ where: { patientId: a.patientId, status: "NO_SHOW_PATIENT", startsAt: { lt: now } } }),
      );
      const leadDays = (a.startsAt.getTime() - now.getTime()) / 86_400_000;
      const hour = Number(hourFmt.format(a.startsAt));
      const risk = scoreNoShow({ priorNoShows: prior, leadDays, hourTehran: hour, kind: a.kind });
      const upd = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
        tx.appointment.updateMany({
          where: { id: a.id, status: "CONFIRMED" },
          data: { noShowRisk: risk.score, riskScoredAt: now },
        }),
      );
      scored += upd.count;
    }
    return { scored };
  }

  // ───────────── تغییر وضعیت ─────────────
  confirm(u: AuthUser, id: string) { return this.apply({ kind: "user", id: u.id, role: u.role }, id, "CONFIRM"); }
  start(u: AuthUser, id: string) { return this.apply({ kind: "user", id: u.id, role: u.role }, id, "START"); }
  complete(u: AuthUser, id: string) { return this.apply({ kind: "user", id: u.id, role: u.role }, id, "COMPLETE"); }
  cancel(u: AuthUser, id: string) {
    return this.apply({ kind: "user", id: u.id, role: u.role }, id, u.role === "DOCTOR" ? "DOCTOR_CANCEL" : "PATIENT_CANCEL");
  }
  reportNoShow(u: AuthUser, id: string) {
    return this.apply({ kind: "user", id: u.id, role: u.role }, id, u.role === "DOCTOR" ? "REPORT_PATIENT_NO_SHOW" : "REPORT_DOCTOR_NO_SHOW");
  }
  /** فراخوانی از فاز ۵ پس از تأیید پرداخت (و job ها برای انقضا) */
  onPaymentSucceeded(id: string) { return this.apply({ kind: "system" }, id, "PAYMENT_SUCCEEDED"); }
  expire(id: string) { return this.apply({ kind: "system" }, id, "EXPIRE"); }

  async apply(actor: Actor, id: string, action: Action, now: Date = new Date()) {
    const ctx = actor.kind === "system" ? ({ role: "SYSTEM" } as const) : ({ role: actor.role, userId: actor.id } as const);

    const result = await this.prisma.withContext(ctx, async (tx) => {
      const a = await tx.appointment.findUnique({
        where: { id },
        select: {
          id: true, doctorId: true, patientId: true, status: true, startsAt: true, endsAt: true, kind: true,
          doctor: { select: { autoConfirm: true } },
          payment: { select: { id: true, status: true, amountRial: true } },
        },
      });
      if (!a) throw new NotFoundException(); // RLS: نوبت دیگران دیده نمی‌شود

      const who = ACTION_ACTOR[action];
      const allowed =
        who === "system" ? actor.kind === "system"
        : actor.kind === "user" && actor.id === (who === "doctor" ? a.doctorId : a.patientId);
      if (!allowed) throw new ForbiddenException({ error: "forbidden" });

      const plan = planAction(action, { status: a.status, startsAt: a.startsAt, endsAt: a.endsAt, autoConfirm: a.doctor.autoConfirm }, now, this.cfg);
      if (!plan.ok) {
        if (plan.error === "invalid_state") throw new ConflictException({ error: "invalid_state", status: a.status });
        throw new UnprocessableEntityException({ error: plan.error });
      }

      // بروزرسانی شرطی روی وضعیت قبلی ⇒ درخواست‌های هم‌زمان فقط یکی موفق می‌شوند
      const upd = await tx.appointment.updateMany({
        where: { id, status: a.status },
        data: { status: plan.to, ...(a.status === "PENDING_PAYMENT" ? { holdExpiresAt: null } : {}) },
      });
      if (upd.count !== 1) throw new ConflictException({ error: "concurrent_modification" });

      await tx.appointmentStatusHistory.create({
        data: { appointmentId: id, fromStatus: a.status, toStatus: plan.to, actorId: actor.kind === "user" ? actor.id : null },
      });

      let refundRial = 0n;
      if (a.payment?.status === "PAID") {
        const r = computeRefund(action, a.payment.amountRial, a.startsAt, now, this.cfg);
        if (r.amountRial > 0n) {
          refundRial = r.amountRial;
          await tx.refund.create({ data: { paymentId: a.payment.id, amountRial: r.amountRial, reason: action } });
          await tx.payment.update({
            where: { id: a.payment.id },
            data: { status: r.amountRial >= a.payment.amountRial ? "REFUNDED" : "PARTIALLY_REFUNDED" },
          });
        }
      }

      await this.audit.logIn(tx, {
        actorId: actor.kind === "user" ? actor.id : null,
        actorRole: actor.kind === "user" ? actor.role : "SYSTEM",
        action: `appointment.${action.toLowerCase()}`,
        objectType: "appointment",
        objectId: id,
        meta: { from: a.status, to: plan.to },
      });
      // اعلان تغییر وضعیت با Outbox: «همین تراکنش» ⇒ وضعیت و اعلان هرگز ناسازگار نمی‌شوند
      await this.outbox.enqueue(tx, {
        type: "appointment.status_changed", aggregateType: "appointment", aggregateId: id,
        payload: { appointmentId: id, patientId: a.patientId, doctorId: a.doctorId, from: a.status, to: plan.to, action },
      });
      return {
        id, status: plan.to, refundRial: refundRial.toString(),
        slot: { doctorId: a.doctorId, startsAt: a.startsAt, endsAt: a.endsAt, kind: a.kind },
      };
    });

    // پس از commit: بستن اتاق ویدئو. شکست این مرحله هرگز تغییر وضعیت نوبت را برنمی‌گرداند.
    if (FINISHING.includes(action)) {
      try { await this.waitlist.notifyCandidates(result.slot.doctorId, result.slot.startsAt, result.slot.endsAt, result.slot.kind); }
      catch (e) { this.log.warn(`waitlist notify failed for ${id}: ${(e as Error).message}`); }
    }
    if (FINISHING.includes(action) && this.lifecycle) {
      try { await this.lifecycle.onFinished(id); }
      catch (e) { this.log.warn(`lifecycle.onFinished failed for ${id}: ${(e as Error).message}`); }
    }
    return result;
  }
}
