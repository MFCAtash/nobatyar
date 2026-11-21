import { randomUUID } from "node:crypto";
import {
  ConflictException, HttpException, Inject, Injectable, Logger, NotFoundException,
  ServiceUnavailableException, UnauthorizedException, UnprocessableEntityException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { AppointmentLifecycleHook } from "../appointments/lifecycle";
import type { AuthUser } from "../common/decorators";
import { NotificationService } from "../notifications/notification.service";
import { PrismaService } from "../prisma/prisma.service";
import { RateLimiter } from "../auth/rate-limit";
import { KV_STORE, KeyValueStore } from "../redis/kv-store";
import type { Status } from "../scheduling/actions";
import { SCHEDULING_CONFIG, SchedulingConfig } from "../scheduling/config";
import { mintJoinToken, ROOM_ADMIN, RoomAdmin, verifyWebhook } from "./livekit";
import { identityOf, JoinDecision, JoinRole, planJoin, userIdOf } from "./video-policy";
import { VIDEO_CONFIG, VideoConfig } from "./video.config";

const JOIN_PER_10MIN = 30;

const EVENT_KIND = {
  room_started: "ROOM_STARTED",
  participant_joined: "PARTICIPANT_JOINED",
  participant_left: "PARTICIPANT_LEFT",
  room_finished: "ROOM_FINISHED",
} as const;

const apptSelect = {
  id: true, doctorId: true, patientId: true, status: true, kind: true, startsAt: true, endsAt: true,
  doctor: { select: { fullName: true } },
  patient: { select: { fullName: true } },
  videoRoom: { select: { id: true, roomName: true, closedAt: true } },
} as const;

export type VideoState = "OPEN" | "TOO_EARLY" | "ENDED" | "UNAVAILABLE" | "NOT_VIDEO";

@Injectable()
export class VideoService implements AppointmentLifecycleHook {
  private readonly log = new Logger(VideoService.name);
  private readonly limiter: RateLimiter;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(VIDEO_CONFIG) private readonly cfg: VideoConfig,
    @Inject(SCHEDULING_CONFIG) private readonly sched: SchedulingConfig,
    @Inject(ROOM_ADMIN) private readonly rooms: RoomAdmin,
    @Inject(KV_STORE) kv: KeyValueStore,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {
    this.limiter = new RateLimiter(kv);
  }

  private policyCfg() {
    return { startEarlyMinutes: this.sched.startEarlyMinutes, joinGraceMinutes: this.cfg.joinGraceMinutes };
  }

  private assertEnabled() {
    if (!this.cfg.enabled) throw new ServiceUnavailableException({ error: "video_unavailable" });
  }

  /** پنجره و وضعیت ویزیت برای UI (بدون صدور توکن). */
  async status(user: AuthUser, appointmentId: string, now: Date = new Date()) {
    const a = await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.appointment.findUnique({ where: { id: appointmentId }, select: apptSelect }),
    );
    if (!a) throw new NotFoundException();
    const plan = planJoin({ ...a, status: a.status as Status }, user.id, now, this.policyCfg());
    if (!plan.ok && plan.error === "not_participant") throw new NotFoundException(); // وجود نوبت لو نرود

    const state: VideoState = plan.ok ? "OPEN"
      : plan.error === "too_early" ? "TOO_EARLY"
      : plan.error === "too_late" ? "ENDED"
      : plan.error === "not_video_visit" ? "NOT_VIDEO"
      : "UNAVAILABLE";
    return {
      available: this.cfg.enabled,
      state,
      appointmentStatus: a.status,
      role: user.id === a.doctorId ? ("doctor" as const) : ("patient" as const),
      opensAt: plan.opensAt ?? null,
      closesAt: plan.closesAt ?? null,
      peer: { fullName: (user.id === a.doctorId ? a.patient.fullName : a.doctor.fullName) || null },
    };
  }

  /** صدور توکن ورود. هر بار اعتبارسنجی کامل (وضعیت، پنجره‌ی زمانی، عضویت) تکرار می‌شود. */
  async join(user: AuthUser, appointmentId: string, now: Date = new Date()) {
    this.assertEnabled();

    const rl = await this.limiter.hit(`video:join:${user.id}`, JOIN_PER_10MIN, 600);
    if (!rl.allowed) throw new HttpException({ error: "too_many_requests", retryAfterSec: rl.retryAfterSec }, 429);

    const ctx = await this.prisma.withContext({ role: user.role, userId: user.id }, async (tx) => {
      const a = await tx.appointment.findUnique({ where: { id: appointmentId }, select: apptSelect });
      if (!a) throw new NotFoundException();

      const plan = planJoin({ ...a, status: a.status as Status }, user.id, now, this.policyCfg());
      if (!plan.ok) throw this.denied(plan, a.status);

      let room = a.videoRoom;
      if (!room) {
        // INSERT ... ON CONFLICT: خطای unique داخل تراکنش Postgres آن را خراب می‌کند، پس با Prisma create نمی‌سازیم.
        await tx.$executeRaw`
          INSERT INTO video_rooms (id, appointment_id, room_name)
          VALUES (${randomUUID()}::uuid, ${appointmentId}::uuid, ${`visit-${randomUUID()}`})
          ON CONFLICT (appointment_id) DO NOTHING`;
        room = await tx.videoRoom.findUnique({ where: { appointmentId }, select: { id: true, roomName: true, closedAt: true } });
      }
      if (!room) throw new ConflictException({ error: "room_unavailable" });
      if (room.closedAt) throw new ConflictException({ error: "invalid_state", status: a.status });

      await this.audit.logIn(tx, {
        actorId: user.id, actorRole: user.role, action: "video.join_token",
        objectType: "appointment", objectId: appointmentId, meta: { role: plan.role },
      });
      return { plan, room, a };
    });

    const { plan, room, a } = ctx;
    const nowSec = Math.floor(now.getTime() / 1000);
    const expiresAtSec = Math.min(nowSec + this.cfg.tokenTtlSec, Math.floor(plan.closesAt.getTime() / 1000));
    const isDoctor = plan.role === "doctor";
    const token = await mintJoinToken({
      apiKey: this.cfg.apiKey,
      apiSecret: this.cfg.apiSecret,
      room: room.roomName,
      identity: identityOf(user.id),
      name: (isDoctor ? a.doctor.fullName : a.patient.fullName) || (isDoctor ? "پزشک" : "بیمار"),
      metadata: { role: plan.role },
      expiresAtSec,
      now,
    });

    return {
      url: this.cfg.wsUrl,
      token,
      role: plan.role,
      expiresAt: new Date(expiresAtSec * 1000),
      closesAt: plan.closesAt,
      peer: { fullName: (isDoctor ? a.patient.fullName : a.doctor.fullName) || null },
    };
  }

  private denied(plan: Extract<JoinDecision, { ok: false }>, status: string): HttpException {
    switch (plan.error) {
      case "not_participant": return new NotFoundException();
      case "not_video_visit": return new UnprocessableEntityException({ error: "not_video_visit" });
      case "invalid_state": return new ConflictException({ error: "invalid_state", status });
      case "too_early": return new UnprocessableEntityException({ error: "too_early", opensAt: plan.opensAt });
      case "too_late": return new UnprocessableEntityException({ error: "too_late" });
    }
  }

  // ───────────── پایان ویزیت ⇒ بستن اتاق ─────────────
  async onFinished(appointmentId: string): Promise<void> {
    if (!this.cfg.enabled) return;
    const room = await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const r = await tx.videoRoom.findUnique({ where: { appointmentId }, select: { roomName: true, closedAt: true } });
      if (!r) return null;
      if (!r.closedAt) await tx.videoRoom.update({ where: { appointmentId }, data: { closedAt: new Date() } });
      return r;
    });
    if (room) await this.rooms.deleteRoom(room.roomName); // همه‌ی شرکت‌کننده‌ها قطع می‌شوند
  }

  // ───────────── webhook ─────────────
  async handleWebhook(rawBody: unknown, authHeader: string | undefined): Promise<{ ok: true }> {
    this.assertEnabled();
    if (typeof rawBody !== "string") throw new UnauthorizedException();
    const ev = await verifyWebhook(rawBody, authHeader, this.cfg.apiKey, this.cfg.apiSecret);
    if (!ev) throw new UnauthorizedException();

    const kind = EVENT_KIND[ev.event as keyof typeof EVENT_KIND];
    const roomName = ev.room?.name;
    if (!kind || !ev.id || !roomName) return { ok: true }; // رویدادهای بی‌اهمیت (track_* و ...)

    const sec = Number(ev.createdAt);
    const at = Number.isFinite(sec) && sec > 0 ? new Date(sec * 1000) : new Date();

    const notifyPatient = await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const room = await tx.videoRoom.findUnique({
        where: { roomName },
        select: { id: true, appointment: { select: { doctorId: true, patientId: true } } },
      });
      if (!room) return null;

      const uid = ev.participant?.identity ? userIdOf(ev.participant.identity) : null;
      const role: JoinRole | null = uid === room.appointment.doctorId ? "doctor" : uid === room.appointment.patientId ? "patient" : null;

      // تکراری (LiveKit ممکن است دوباره بفرستد) ⇒ هیچ اثری ندارد
      const inserted = await tx.$executeRaw`
        INSERT INTO video_events (event_id, room_id, kind, role, at)
        VALUES (${ev.id}, ${room.id}::uuid, ${kind}::"VideoEventKind", ${role}, ${at.toISOString()}::timestamptz)
        ON CONFLICT (event_id) DO NOTHING`;
      if (inserted === 0 || kind !== "PARTICIPANT_JOINED" || !role) return null;

      const first = await tx.videoRoom.updateMany({
        where: { id: room.id, ...(role === "doctor" ? { doctorFirstJoinAt: null } : { patientFirstJoinAt: null }) },
        data: role === "doctor" ? { doctorFirstJoinAt: at } : { patientFirstJoinAt: at },
      });
      return role === "doctor" && first.count === 1 ? room.appointment.patientId : null;
    });

    if (notifyPatient) {
      const apptId = await this.appointmentIdOf(roomName);
      await this.notifications.push(notifyPatient, {
        kind: "VIDEO_ROOM_READY",
        titleFa: "پزشک وارد اتاق ویزیت شد",
        bodyFa: "برای شروع ویزیت تصویری وارد شوید.",
        payload: apptId ? { appointmentId: apptId } : undefined,
      });
    }
    return { ok: true };
  }

  private async appointmentIdOf(roomName: string): Promise<string | null> {
    const r = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.videoRoom.findUnique({ where: { roomName }, select: { appointmentId: true } }),
    );
    return r?.appointmentId ?? null;
  }
}
