import { randomUUID } from "node:crypto";
import { Inject, Injectable, UnprocessableEntityException } from "@nestjs/common";
import type { Prisma, VitalType } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../common/decorators";
import { aad, FIELD_CRYPTO, type FieldCrypto } from "../crypto";
import { NotificationService } from "../notifications/notification.service";
import { PrismaService } from "../prisma/prisma.service";
import { classifyVital, trend, validateVital, VITAL_RULES, type VitalFlag } from "./vitals-policy";

export const VITAL_TYPES = Object.keys(VITAL_RULES) as VitalType[];

export interface VitalInput {
  type: VitalType;
  valuePrimary: number;
  valueSecondary?: number | null;
  measuredAt: string;
  source: "MANUAL" | "DEVICE";
  note?: string;
}

const present = (r: { id: string; patientId: string; type: VitalType; valuePrimary: number; valueSecondary: number | null; unit: string; measuredAt: Date; source: string; patient?: { fullName: string } | null }) => ({
  id: r.id,
  patientId: r.patientId,
  patientName: r.patient?.fullName ?? null,
  type: r.type,
  valuePrimary: r.valuePrimary,
  valueSecondary: r.valueSecondary,
  unit: r.unit,
  measuredAt: r.measuredAt,
  source: r.source,
  flag: classifyVital(r.type, r.valuePrimary, r.valueSecondary),
});

@Injectable()
export class VitalsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  /** فقط بیمار میتواند اندازهگیری ثبت کند. هشدارها به بیمار و پزشک(ان) قبلی او ارسال میشود. */
  async create(u: AuthUser, input: VitalInput, now = new Date()) {
    const issues = validateVital(input.type, input.valuePrimary, input.valueSecondary);
    if (issues.length) throw new UnprocessableEntityException({ error: "vital_invalid", issues });
    const measuredAt = new Date(input.measuredAt);
    if (!Number.isFinite(measuredAt.getTime())) throw new UnprocessableEntityException({ error: "vital_invalid", issues: ["invalid_measured_at"] });
    const flag = classifyVital(input.type, input.valuePrimary, input.valueSecondary);

    const created = await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      const id = cryptoId();
      const row = await tx.vitalReading.create({
        data: {
          id, patientId: u.id, type: input.type, valuePrimary: input.valuePrimary,
          valueSecondary: input.valueSecondary ?? null, unit: VITAL_RULES[input.type].unit,
          measuredAt, source: input.source,
          noteEnc: input.note ? this.crypto.encrypt(input.note, aad("vital_readings", id, "note")) : null,
        },
        select: { id: true, patientId: true, type: true, valuePrimary: true, valueSecondary: true, unit: true, measuredAt: true, source: true },
      });
      if (flag !== "normal") {
        await this.audit.logIn(tx, {
          actorId: u.id, actorRole: u.role, action: "vital.flagged", objectType: "vital_reading", objectId: id,
          meta: { type: input.type, flag }, // مقدار عددی در Audit نمیرود (داده سلامت است)
        });
      }
      return row;
    });

    if (flag !== "normal") {
      await this.notifications.push(u.id, {
        kind: "VITAL_ALERT",
        titleFa: "اندازهگیری غیرعادی ثبت شد",
        bodyFa: "یکی از اندازهگیریهای شما خارج از بازه معمول است. در صورت نگرانی با پزشک خود تماس بگیرید.",
        payload: { vitalId: created.id },
      });
      // پزشکانی که با این بیمار نوبت داشتهاند (RLS اجازه خواندن اندازهگیری را برایشان میدهد)
      const doctors = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
        tx.appointment.findMany({ where: { patientId: u.id }, select: { doctorId: true }, distinct: ["doctorId"], take: 20 }),
      );
      for (const d of doctors) {
        await this.notifications.push(d.doctorId, {
          kind: "VITAL_ALERT", titleFa: "هشدار پایش از راه دور",
          bodyFa: "یکی از بیماران شما اندازهای خارج از بازه معمول ثبت کرده است. لطفاً پرونده را بررسی کنید.",
          payload: { vitalId: created.id, patientId: u.id },
        });
      }
    }
    return present(created);
  }

  /** روند اندازهگیریها: بیمار فقط خود و پزشک فقط بیماران دارای نوبت (توسط RLS محدود میشود). */
  async list(u: AuthUser, q: { type?: VitalType; from?: string; to?: string; limit: number; cursor?: string }) {
    const where: Prisma.VitalReadingWhereInput = {
      ...(q.type ? { type: q.type } : {}),
      ...(q.from || q.to ? { measuredAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } } : {}),
    };
    const rows = await this.prisma.withContext({ role: u.role, userId: u.id }, (tx) =>
      tx.vitalReading.findMany({
        where, orderBy: [{ measuredAt: "desc" }, { id: "desc" }], take: q.limit + 1,
        select: {
          id: true, patientId: true, type: true, valuePrimary: true, valueSecondary: true,
          unit: true, measuredAt: true, source: true, patient: { select: { fullName: true } },
        },
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      }),
    );
    const page = rows.slice(0, q.limit);
    return {
      items: page.map(present),
      nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null,
      trend: trend([...page].reverse().map((r) => r.valuePrimary)),
    };
  }

  /** حذف اندازهگیری توسط ثبتکننده (بیمار) — لاگ ممیزی میشود. */
  async remove(u: AuthUser, id: string) {
    const r = await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      const found = await tx.vitalReading.findUnique({ where: { id }, select: { patientId: true } });
      if (!found) throw new UnprocessableEntityException({ error: "not_found" });
      if (found.patientId !== u.id) throw new UnprocessableEntityException({ error: "forbidden" });
      await tx.vitalReading.delete({ where: { id } });
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "vital.deleted", objectType: "vital_reading", objectId: id });
      return { deleted: true };
    });
    return r;
  }
}

const cryptoId = () => randomUUID();

export type { VitalFlag };
