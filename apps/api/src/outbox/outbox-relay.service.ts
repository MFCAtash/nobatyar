import { setSpanAttributes, withSpan } from "../observability/tracing";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { outboxDead, outboxProcessed, outboxRetried } from "../observability/metrics";
import { NotificationService } from "../notifications/notification.service";
import { PrismaService } from "../prisma/prisma.service";
import { buildHandlers } from "./outbox-handlers";
import { PrismaOutboxStore } from "./prisma-outbox-store";
import { OutboxRelay, type RelayResult } from "./outbox.relay";

/** اجرای relay (فراخوان: SchedulerService، هر چند ثانیه، فقط در worker). */
@Injectable()
export class OutboxRelayService {
  private readonly log = new Logger(OutboxRelayService.name);
  private readonly store: PrismaOutboxStore;
  private readonly relay: OutboxRelay;
  private lastPurge = 0;

  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(NotificationService) notifications: NotificationService,
  ) {
    this.store = new PrismaOutboxStore(prisma);
    this.relay = new OutboxRelay(this.store, buildHandlers((d) => notifications.deliver(d)), {
      onProcessed: (type) => outboxProcessed.inc({ type }),
      onRetry: (type) => outboxRetried.inc({ type }),
      onDead: (type) => outboxDead.inc({ type }),
      log: (level, msg) => (level === "error" ? this.log.error(msg) : this.log.warn(msg)),
    });
  }

  /** تا خالی‌شدن صف (حداکثر ۵ دور) می‌چرخد؛ هر ساعت یک‌بار رویدادهای قدیمیِ PROCESSED را پاک می‌کند. */
  tick(now: Date = new Date()): Promise<RelayResult> {
    return withSpan("outbox.relay.tick", {}, async (span) => {
      const r = await this.tickInner(now);
      setSpanAttributes(span, { "outbox.claimed": r.claimed, "outbox.processed": r.processed, "outbox.retried": r.retried, "outbox.dead": r.dead });
      return r;
    });
  }

  private async tickInner(now: Date): Promise<RelayResult> {
    const total: RelayResult = { claimed: 0, processed: 0, retried: 0, dead: 0 };
    for (let i = 0; i < 5; i++) {
      const r = await this.relay.runOnce();
      total.claimed += r.claimed; total.processed += r.processed; total.retried += r.retried; total.dead += r.dead;
      if (r.claimed === 0) break;
    }
    if (now.getTime() - this.lastPurge > 3_600_000) {
      this.lastPurge = now.getTime();
      const n = await this.store.purge(now).catch(() => 0);
      if (n > 0) this.log.log(`outbox purged ${n} processed events`);
    }
    return total;
  }
}
