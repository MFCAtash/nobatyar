import type { StoredEvent } from "./outbox-events";
import { decideFailure, LEASE_MS, PROCESSED_RETENTION_MS } from "./outbox-policy";

export interface OutboxStore {
  /** اتمیک: رویدادهای آماده را «اجاره» می‌کند (available_at ← now+lease، attempts+1) و برمی‌گرداند. */
  claim(now: Date, limit: number, leaseMs?: number): Promise<StoredEvent[]>;
  markProcessed(id: string, now: Date): Promise<void>;
  markFailed(id: string, error: string, attempts: number, now: Date): Promise<"retry" | "dead">;
  purge(now: Date): Promise<number>;
}

interface Row extends StoredEvent { status: "PENDING" | "PROCESSED" | "DEAD"; availableAt: Date; lastError: string | null; processedAt: Date | null }

/** نسخه‌ی حافظه‌ای (تست). منطق claim همان معنای `FOR UPDATE SKIP LOCKED` ی Postgres را دارد: قفل‌شده‌ها دیده نمی‌شوند. */
export class InMemoryOutboxStore implements OutboxStore {
  rows: Row[] = [];
  add(e: Omit<StoredEvent, "attempts" | "createdAt"> & Partial<Pick<StoredEvent, "attempts" | "createdAt">>, availableAt = new Date(0)): void {
    this.rows.push({ attempts: 0, createdAt: new Date(0), ...e, status: "PENDING", availableAt, lastError: null, processedAt: null });
  }
  async claim(now: Date, limit: number, leaseMs = LEASE_MS): Promise<StoredEvent[]> {
    const ready = this.rows.filter((r) => r.status === "PENDING" && r.availableAt <= now).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).slice(0, limit);
    for (const r of ready) { r.attempts += 1; r.availableAt = new Date(now.getTime() + leaseMs); }
    return ready.map(({ id, type, aggregateType, aggregateId, payload, attempts, createdAt }) => ({ id, type, aggregateType, aggregateId, payload, attempts, createdAt }));
  }
  async markProcessed(id: string, now: Date): Promise<void> {
    const r = this.rows.find((x) => x.id === id);
    if (r) { r.status = "PROCESSED"; r.processedAt = now; r.lastError = null; }
  }
  async markFailed(id: string, error: string, attempts: number, now: Date): Promise<"retry" | "dead"> {
    const r = this.rows.find((x) => x.id === id);
    if (!r) return "dead";
    const d = decideFailure(attempts, now);
    r.lastError = error;
    if (d.status === "DEAD") { r.status = "DEAD"; return "dead"; }
    r.availableAt = d.availableAt;
    return "retry";
  }
  async purge(now: Date): Promise<number> {
    const keep = this.rows.filter((r) => !(r.status === "PROCESSED" && r.processedAt && now.getTime() - r.processedAt.getTime() > PROCESSED_RETENTION_MS));
    const n = this.rows.length - keep.length;
    this.rows = keep;
    return n;
  }
}
