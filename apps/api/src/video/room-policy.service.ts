import { createHash } from "node:crypto";
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../common/decorators";
import { moduleEnabled } from "../common/feature-flags";
import { PrismaService } from "../prisma/prisma.service";
import {
  canRecord,
  joinGate,
  normalizePolicy,
  recordingConsentHash,
  retentionDeadline,
  type RecordingConsent,
  type RoomPolicy,
} from "./room-policy";
import type { RoomPolicyInput } from "./room-policy.schemas";

function requireFlag() {
  if (!moduleEnabled("FF_M8_VIDEO_SMART")) throw new BadRequestException({ error: "module_disabled" });
}

const CONSENT_POLICY = "VIDEO_RECORDING";
const CONSENT_VERSION = "1";

@Injectable()
export class RoomPolicyService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async participant(user: AuthUser, appointmentId: string) {
    const a = await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.appointment.findUnique({
        where: { id: appointmentId },
        select: { id: true, patientId: true, doctorId: true, kind: true, startsAt: true, status: true },
      }),
    );
    if (!a || (a.patientId !== user.id && a.doctorId !== user.id)) throw new NotFoundException();
    return a;
  }

  async get(user: AuthUser, appointmentId: string) {
    requireFlag();
    await this.participant(user, appointmentId);
    const row = await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.videoRoomPolicy.findUnique({ where: { appointmentId } }),
    );
    const policy = normalizePolicy(row as Partial<RoomPolicy> | null);
    const consent = await this.consentState(appointmentId, user);
    return {
      policy,
      consent,
      recordingAllowed: canRecord(policy, consent),
      retentionDeadline: retentionDeadline(new Date(), policy),
    };
  }

  async put(user: AuthUser, appointmentId: string, input: RoomPolicyInput) {
    requireFlag();
    const a = await this.participant(user, appointmentId);
    if (a.doctorId !== user.id) throw new ForbiddenException({ error: "doctor_only" });
    if (a.kind !== "VIDEO") throw new BadRequestException({ error: "not_video_visit" });

    const current = await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.videoRoomPolicy.findUnique({ where: { appointmentId } }),
    );
    const merged = normalizePolicy({ ...normalizePolicy(current as Partial<RoomPolicy> | null), ...input });

    await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.videoRoomPolicy.upsert({
        where: { appointmentId },
        update: merged,
        create: { appointmentId, ...merged },
      }),
    );
    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: "video.policy.update",
      objectType: "video_room_policies",
      objectId: appointmentId,
      meta: { recordConsent: merged.recordConsent, retentionHours: merged.retentionHours },
    });
    return this.get(user, appointmentId);
  }

  /** ثبت رضایت ضبط؛ هر طرف فقط رضایت خودش را ثبت می‌کند (جعل رضایت طرف دیگر ممکن نیست). */
  async acceptRecording(user: AuthUser, appointmentId: string) {
    requireFlag();
    const a = await this.participant(user, appointmentId);
    if (a.kind !== "VIDEO") throw new BadRequestException({ error: "not_video_visit" });

    const policy = normalizePolicy(
      await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
        tx.videoRoomPolicy.findUnique({ where: { appointmentId } }),
      ),
    );
    if (!policy.recordConsent) throw new BadRequestException({ error: "recording_disabled" });

    const hash = createHash("sha256").update(recordingConsentHash(appointmentId, user.id)).digest("hex");
    await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.consentReceipt.create({
        data: { userId: user.id, policy: CONSENT_POLICY, version: CONSENT_VERSION, channel: "video", hash },
      }),
    );
    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: "video.recording_consent",
      objectType: "appointment",
      objectId: appointmentId,
    });
    return this.get(user, appointmentId);
  }

  private async consentState(appointmentId: string, user: AuthUser): Promise<RecordingConsent> {
    void user;
    const a = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.appointment.findUnique({ where: { id: appointmentId }, select: { patientId: true, doctorId: true } }),
    );
    if (!a) return { patient: false, doctor: false };
    const all = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.consentReceipt.findMany({
        where: {
          policy: CONSENT_POLICY,
          version: CONSENT_VERSION,
          userId: { in: [a.patientId, a.doctorId] },
        },
        select: { userId: true, hash: true },
      }),
    );
    // فقط رسیدهایی معتبرند که hash آنها دقیقاً به همین نوبت و همین کاربر گره خورده باشد.
    const valid = new Set(
      all
        .filter(
          (r) =>
            r.hash ===
            createHash("sha256").update(recordingConsentHash(appointmentId, r.userId)).digest("hex"),
        )
        .map((r) => r.userId),
    );
    return { patient: valid.has(a.patientId), doctor: valid.has(a.doctorId) };
  }

  /** وضعیت ورود به اتاق انتظار (برای UI). */
  async gate(user: AuthUser, appointmentId: string, admitted: boolean) {
    requireFlag();
    const a = await this.participant(user, appointmentId);
    const policy = normalizePolicy(
      await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
        tx.videoRoomPolicy.findUnique({ where: { appointmentId } }),
      ),
    );
    return {
      gate: joinGate(policy, user.id === a.doctorId ? "doctor" : "patient", admitted),
      policy,
    };
  }
}
