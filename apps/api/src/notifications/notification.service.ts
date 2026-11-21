import { Injectable, Inject, Logger, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { NotificationKind, Prisma } from "@prisma/client";
import type { Delivery } from "../outbox/outbox-handlers";
import { NotificationHub } from "./notification-hub";
import { UUID_RE } from "./sse-format";
import type { NotificationEvent } from "./sse-format";
import type { ReplayResult } from "./sse-session";

export interface PushInput {
  kind:    NotificationKind;
  titleFa: string;
  bodyFa:  string;
  payload?: Record<string, unknown>;
}

/**
 * هم‌پوشانی بازپخش: اعلان‌ها بلافاصله پس از INSERT منتشر می‌شوند، ولی ترتیب «تحویل» بین نمونه‌ها
 * ممکن است با ترتیب createdAt کمی فرق کند. بازپخش از «createdAt ی cursor منهای این مقدار» شروع می‌شود؛
 * تکراری‌ها با id در سرور (session) و کلاینت حذف می‌شوند، ولی هیچ اعلانی گم نمی‌شود.
 * (به‌علاوه: Date ی JS دقتش میلی‌ثانیه است و Postgres میکروثانیه.)
 */
export const REPLAY_OVERLAP_MS = 10_000;

const SSE_SELECT = {
  id: true, kind: true, titleFa: true, bodyFa: true, payload: true, readAt: true, createdAt: true,
} as const;

interface Row {
  id: string; kind: string; titleFa: string; bodyFa: string;
  payload: unknown; readAt: Date | null; createdAt: Date;
}

export function toEvent(r: Row): NotificationEvent {
  return {
    id: r.id, kind: r.kind, titleFa: r.titleFa, bodyFa: r.bodyFa,
    payload: r.payload ?? {}, readAt: r.readAt ? r.readAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(PrismaService)    private readonly prisma: PrismaService,
    @Inject(NotificationHub)  private readonly hub:    NotificationHub,
  ) {}

  /**
   * ذخیره‌ی اعلان در DB (منبع حقیقت) و سپس انتشار روی Redis برای همه‌ی نمونه‌ها.
   * انتشار best-effort است: اگر به هر دلیل نرسید، کلاینت هنگام reconnect از DB می‌گیرد.
   */
  async push(userId: string, input: PushInput): Promise<void> {
    try {
      const notif = await this.prisma.notification.create({
        data: {
          userId,
          kind:    input.kind,
          titleFa: input.titleFa,
          bodyFa:  input.bodyFa,
          payload: (input.payload ?? {}) as Prisma.InputJsonValue,
        },
        select: SSE_SELECT,
      });
      await this.hub.publish(userId, toEvent(notif));
    } catch (err) {
      // اعلان‌ها non-critical هستند — لاگ می‌کنیم ولی throw نمی‌کنیم
      this.logger.error(`push notification failed for ${userId}`, err);
    }
  }

  /**
   * تحویل از Outbox: ایدمپوتنت (id قطعی ⇒ تحویل دوباره بی‌اثر) و «throw می‌کند» تا relay دوباره امتحان کند.
   * انتشار زنده best-effort است (کلاینت هنگام reconnect از DB می‌گیرد).
   */
  async deliver(d: Delivery): Promise<void> {
    const created = await this.prisma.notification.createMany({
      data: [{ id: d.notificationId, userId: d.userId, kind: d.kind as NotificationKind, titleFa: d.titleFa, bodyFa: d.bodyFa, payload: d.payload as object }],
      skipDuplicates: true,
    });
    if (created.count === 0) return; // پیش‌تر تحویل شده
    try {
      await this.hub.publish(d.userId, toEvent({ id: d.notificationId, kind: d.kind, titleFa: d.titleFa, bodyFa: d.bodyFa, payload: d.payload, readAt: null, createdAt: new Date() }));
    } catch (err) {
      this.logger.warn(`live publish failed for ${d.userId}: ${(err as Error).message}`);
    }
  }

  /**
   * اعلان‌های از دست‌رفته‌ی یک کاربر پس از Last-Event-ID (قدیمی‌ترین اول).
   * cursor باید متعلق به «همین کاربر» باشد؛ شناسه‌ی دیگران مثل ناموجود رفتار می‌شود (نشت نمی‌کند).
   * اگر بازپخش مطمئن ممکن نیست، `resync` برمی‌گرداند تا کلاینت لیست را از REST بگیرد.
   */
  async replayAfter(userId: string, afterId: string, max: number): Promise<ReplayResult> {
    if (!UUID_RE.test(afterId)) return { status: "resync", reason: "invalid_cursor" };

    const cursor = await this.prisma.notification.findFirst({
      where: { id: afterId, userId },
      select: { createdAt: true },
    });
    if (!cursor) return { status: "resync", reason: "unknown_cursor" };

    const rows = await this.prisma.notification.findMany({
      where: { userId, createdAt: { gte: new Date(cursor.createdAt.getTime() - REPLAY_OVERLAP_MS) } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: max + 1,
      select: SSE_SELECT,
    });
    if (rows.length > max) return { status: "resync", reason: "gap" };

    // خودِ cursor را کلاینت دارد؛ بقیه‌ی هم‌پوشانی با id حذف می‌شود
    return { status: "ok", items: rows.filter((r) => r.id !== afterId).map(toEvent) };
  }

  /** لیست اعلان‌های کاربر (صفحه‌بندی) */
  async list(userId: string, opts: { unreadOnly?: boolean; cursor?: string }) {
    const PAGE = 20;
    const where: Prisma.NotificationWhereInput = { userId };
    if (opts.unreadOnly) where.readAt = null;
    if (opts.cursor)     where.id = { lt: opts.cursor };

    const items = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take:    PAGE + 1,
    });

    const hasMore = items.length > PAGE;
    return {
      items:   hasMore ? items.slice(0, PAGE) : items,
      hasMore,
      cursor:  hasMore ? items[PAGE - 1].id : null,
      unread:  await this.prisma.notification.count({ where: { userId, readAt: null } }),
    };
  }

  /** علامت خوانده */
  async markRead(userId: string, id: string): Promise<void> {
    const n = await this.prisma.notification.findUnique({ where: { id } });
    if (!n)              throw new NotFoundException();
    if (n.userId !== userId) throw new ForbiddenException();
    await this.prisma.notification.update({
      where: { id },
      data:  { readAt: new Date() },
    });
  }

  /** همه را خوانده کن */
  async markAllRead(userId: string): Promise<{ updated: number }> {
    const r = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data:  { readAt: new Date() },
    });
    return { updated: r.count };
  }
}
