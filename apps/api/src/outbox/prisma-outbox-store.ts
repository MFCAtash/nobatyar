import type { PrismaService } from "../prisma/prisma.service";
import type { StoredEvent } from "./outbox-events";
import { decideFailure, LEASE_MS, PROCESSED_RETENTION_MS } from "./outbox-policy";
import type { OutboxStore } from "./outbox-store";

interface Raw { id: string; type: string; aggregateType: string; aggregateId: string; payload: unknown; attempts: number; createdAt: Date }

export class PrismaOutboxStore implements OutboxStore {
  constructor(private readonly prisma: Pick<PrismaService, "withContext">) {}

  /**
   * UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING:
   * چند relay (چند نمونه‌ی worker) هم‌زمان هرگز یک رویداد را نمی‌گیرند. اجاره (available_at) پس از مرگ relay منقضی می‌شود ⇒ تحویل مجدد.
   */
  claim(now: Date, limit: number, leaseMs: number = LEASE_MS): Promise<StoredEvent[]> {
    const lease = new Date(now.getTime() + leaseMs);
    return this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const rows = await tx.$queryRaw<Raw[]>`
        UPDATE outbox_events SET available_at = ${lease}, attempts = attempts + 1
        WHERE id IN (
          SELECT id FROM outbox_events WHERE status = 'PENDING' AND available_at <= ${now}
          ORDER BY created_at LIMIT ${limit} FOR UPDATE SKIP LOCKED
        )
        RETURNING id, type, aggregate_type AS "aggregateType", aggregate_id AS "aggregateId", payload, attempts, created_at AS "createdAt"`;
      return rows.map((r) => ({ ...r, attempts: Number(r.attempts) })).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    });
  }

  async markProcessed(id: string, now: Date): Promise<void> {
    await this.prisma.withContext({ role: "SYSTEM" }, (tx) => tx.outboxEvent.updateMany({ where: { id, status: "PENDING" }, data: { status: "PROCESSED", processedAt: now, lastError: null } }));
  }

  async markFailed(id: string, error: string, attempts: number, now: Date): Promise<"retry" | "dead"> {
    const d = decideFailure(attempts, now);
    await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.outboxEvent.updateMany({ where: { id, status: "PENDING" }, data: d.status === "DEAD" ? { status: "DEAD", lastError: error } : { availableAt: d.availableAt, lastError: error } }),
    );
    return d.status === "DEAD" ? "dead" : "retry";
  }

  async purge(now: Date): Promise<number> {
    const r = await this.prisma.withContext({ role: "SYSTEM" }, (tx) => tx.outboxEvent.deleteMany({ where: { status: "PROCESSED", processedAt: { lt: new Date(now.getTime() - PROCESSED_RETENTION_MS) } } }));
    return r.count;
  }
}
