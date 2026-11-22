import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../common/decorators";
import { PrismaService } from "../prisma/prisma.service";
import { escalationTarget, shouldEscalate } from "./escalation";
import { mergePreferences, type PreferenceRow } from "./orchestrator";
import type { PutPreferencesInput } from "./preferences.schemas";

@Injectable()
export class NotificationPreferencesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async get(user: AuthUser) {
    const rows = await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.notificationPreference.findMany({
        where: { userId: user.id },
        select: { eventType: true, channel: true, enabled: true, quietFrom: true, quietTo: true },
        orderBy: [{ eventType: "asc" }, { channel: "asc" }],
      }),
    );
    const withQuiet = rows.find((r) => r.quietFrom && r.quietTo);
    return {
      matrix: mergePreferences(rows as PreferenceRow[]),
      quietFrom: withQuiet?.quietFrom ?? null,
      quietTo: withQuiet?.quietTo ?? null,
      rows,
    };
  }

  async put(user: AuthUser, input: PutPreferencesInput) {
    await this.prisma.withContext({ role: user.role, userId: user.id }, async (tx) => {
      for (const item of input.items) {
        await tx.notificationPreference.upsert({
          where: {
            userId_eventType_channel: { userId: user.id, eventType: item.eventType, channel: item.channel },
          },
          update: { enabled: item.enabled, quietFrom: input.quietFrom ?? null, quietTo: input.quietTo ?? null },
          create: {
            userId: user.id,
            eventType: item.eventType,
            channel: item.channel,
            enabled: item.enabled,
            quietFrom: input.quietFrom ?? null,
            quietTo: input.quietTo ?? null,
          },
        });
      }
    });
    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: "notification.preferences.update",
      objectType: "notification_preferences",
      objectId: user.id,
      meta: { items: input.items.length, quiet: Boolean(input.quietFrom) },
    });
    return this.get(user);
  }

  async listTemplates(user: AuthUser) {
    return this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.notificationTemplate.findMany({ orderBy: [{ key: "asc" }, { version: "desc" }] }),
    );
  }

  /**
   * فعال‌سازی نسخه: فقط یک نسخه از هر کلید فعال می‌ماند.
   * نسخهٔ درخواستی باید وجود داشته باشد؛ در غیر این صورت 404 (بدون ساختن رکورد ناقص).
   */
  async activateTemplate(user: AuthUser, key: string, version: number) {
    const row = await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.notificationTemplate.findFirst({ where: { key, version } }),
    );
    if (!row) throw new NotFoundException({ error: "template_version_not_found" });

    await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.notificationTemplate.update({ where: { key }, data: { enabled: true } }),
    );
    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: "notification.template.activate",
      objectType: "notification_templates",
      objectId: `${key}@${version}`,
    });
    return { key, version, enabled: true };
  }

  async deadLetters(user: AuthUser, limit = 50) {
    return this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.deadLetterNotice.findMany({
        orderBy: { createdAt: "desc" },
        take: Math.min(Math.max(limit, 1), 200),
      }),
    );
  }

  /** retry در این لایه «علامت‌گذاری برای ارسال مجدد» است؛ ارسال واقعی در worker انجام می‌شود. */
  async retryDeadLetter(user: AuthUser, id: string) {
    const row = await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.deadLetterNotice.findUnique({ where: { id } }),
    );
    if (!row) throw new NotFoundException();
    const updated = await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.deadLetterNotice.update({ where: { id }, data: { retryCount: { increment: 1 } } }),
    );
    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: "notification.dead_letter.retry",
      objectType: "dead_letter_notices",
      objectId: id,
      meta: { channel: row.channel, retryCount: updated.retryCount },
    });
    return { id, retryCount: updated.retryCount };
  }

  /** ارتقای تلفنی به مسئولِ آمادهباش: تصمیم + ثبت Audit (بدون تماس خارجی). */
  async escalateDeadLetter(user: AuthUser, id: string) {
    const row = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.deadLetterNotice.findUnique({ where: { id } }),
    );
    if (!row) throw new NotFoundException();
    const updated = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.deadLetterNotice.update({ where: { id }, data: { retryCount: { increment: 1 } } }),
    );
    const escalated = shouldEscalate({
      eventType: row.channel === "sms" ? "APPOINTMENT_REMINDER" : "SECURITY",
      retryCount: updated.retryCount,
      urgent: row.channel === "sms",
      quiet: false,
      acknowledged: false,
    });
    const attempts = escalated ? escalationTarget(updated.retryCount) : 0;
    if (escalated) {
      await this.audit.log({
        actorId: user.id,
        actorRole: user.role,
        action: "notification.escalation.call",
        objectType: "dead_letter_notices",
        objectId: id,
        meta: { escalated: true, attempts },
      });
    }
    return { id, escalated, attempts };
  }
}
