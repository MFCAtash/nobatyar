import { randomUUID } from "node:crypto";
import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../common/decorators";
import { NotificationService } from "../notifications/notification.service";
import { PrismaService } from "../prisma/prisma.service";
import { matchesFreedSlot } from "./waitlist-policy";

const TTL_DAYS = 7;
const MAX_OFFERS = 3;

/** A24: لیست انتظار — پیشنهاد محدود وقت آزادشده (رزرو نهایی توسط بیمار انجام میشود). */
@Injectable()
export class WaitlistService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  async join(u: AuthUser, input: { doctorId: string; kind: "IN_PERSON" | "VIDEO" | "CHAT"; desiredFrom: string; desiredTo: string }) {
    const from = new Date(input.desiredFrom), to = new Date(input.desiredTo);
    if (from >= to) throw new ConflictException({ error: "invalid_window" });
    const id = randomUUID();
    await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      await tx.appointmentWaitlist.create({
        data: {
          id, doctorId: input.doctorId, patientId: u.id, kind: input.kind,
          desiredFrom: from, desiredTo: to, expiresAt: new Date(Date.now() + TTL_DAYS * 86_400_000),
        },
      });
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "waitlist.joined", objectType: "waitlist", objectId: id });
    });
    return { id, status: "WAITING" as const };
  }

  mine(u: AuthUser) {
    return this.prisma.withContext({ role: u.role, userId: u.id }, (tx) =>
      tx.appointmentWaitlist.findMany({ where: { patientId: u.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    );
  }

  async leave(u: AuthUser, id: string) {
    const row = await this.prisma.withContext({ role: u.role, userId: u.id }, (tx) => tx.appointmentWaitlist.findUnique({ where: { id }, select: { patientId: true } }));
    if (!row || row.patientId !== u.id) throw new NotFoundException();
    await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      await tx.appointmentWaitlist.update({ where: { id }, data: { status: "CANCELLED" } });
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "waitlist.left", objectType: "waitlist", objectId: id });
    });
    return { id, status: "CANCELLED" as const };
  }

  /** وقتی نوبتی آزاد شد، حداکثر ۳ بیمار منطبق را مطلع میکند. */
  async notifyCandidates(doctorId: string, startsAt: Date, endsAt: Date, kind: string, now = new Date()) {
    const rows = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.appointmentWaitlist.findMany({
        where: { doctorId, status: "WAITING", expiresAt: { gt: now } },
        select: { id: true, patientId: true, kind: true, desiredFrom: true, desiredTo: true }, take: 100,
      }),
    );
    const matched = rows.filter((w) => matchesFreedSlot(w, { startsAt, endsAt, kind }, now)).slice(0, MAX_OFFERS);
    await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      for (const w of matched) await tx.appointmentWaitlist.update({ where: { id: w.id }, data: { status: "NOTIFIED", notifiedAt: now } });
    });
    for (const w of matched) {
      await this.notifications.push(w.patientId, {
        kind: "WAITLIST_OFFER", titleFa: "وقت آزاد مناسب شما پیدا شد",
        bodyFa: "یک نوبت در بازه دلخواه شما آزاد شد. برای رزرو آن اقدام کنید.",
        payload: { startsAt: startsAt.toISOString(), doctorId },
      });
    }
    return { notified: matched.length };
  }

  async expireStale(now = new Date()) {
    const r = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.appointmentWaitlist.updateMany({ where: { status: { in: ["WAITING", "NOTIFIED"] }, expiresAt: { lte: now } }, data: { status: "EXPIRED" } }),
    );
    return { expired: r.count };
  }
}
