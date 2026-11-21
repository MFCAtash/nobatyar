import { Inject, Injectable, Logger } from "@nestjs/common";
import { KV_STORE, type KeyValueStore } from "../redis/kv-store";
import { PrismaService } from "../prisma/prisma.service";
import {
  applyIncidents, COMPONENT_NAMES, notificationsStatus, paymentStatus, probeStatus, rollup,
  type Component, type ComponentId, type ComponentStatus, type IncidentImpact, type IncidentStatus, type PaymentWindow,
} from "./status-policy";

export interface PublicIncident {
  id: string; titleFa: string; status: IncidentStatus; impact: IncidentImpact; componentId: ComponentId | null;
  startedAt: string; resolvedAt: string | null; updates: { status: IncidentStatus; bodyFa: string; at: string }[];
}
export interface StatusSnapshot { overall: ComponentStatus; updatedAt: string; components: Component[]; incidents: PublicIncident[] }

const CACHE_MS = 30_000;
const PROBE_TIMEOUT_MS = 2_500;
const PAYMENT_WINDOW_MIN = 30;
const UNSYNCED_AFTER_MIN = 15;
const RECENT_DAYS = 7;

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("probe timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e: unknown) => { clearTimeout(t); reject(e instanceof Error ? e : new Error(String(e))); });
  });

async function timed(fn: () => Promise<unknown>): Promise<{ ok: boolean; ms: number }> {
  const t0 = Date.now();
  try { await withTimeout(fn(), PROBE_TIMEOUT_MS); return { ok: true, ms: Date.now() - t0 }; } catch { return { ok: false, ms: Date.now() - t0 }; }
}

/**
 * وضعیت عمومی سامانه. snapshot هر ۳۰ ثانیه یک‌بار ساخته می‌شود (درخواست‌های عمومی DB را نمی‌کوبند)،
 * و ساخت آن هرگز throw نمی‌کند. هیچ عددی از داخل سامانه بیرون نمی‌رود.
 */
@Injectable()
export class StatusService {
  private readonly log = new Logger(StatusService.name);
  private cache: { at: number; value: StatusSnapshot } | null = null;
  private inflight: Promise<StatusSnapshot> | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(KV_STORE) private readonly kv: KeyValueStore,
  ) {}

  async snapshot(now: Date = new Date()): Promise<StatusSnapshot> {
    if (this.cache && now.getTime() - this.cache.at < CACHE_MS) return this.cache.value;
    this.inflight ??= this.build(now).finally(() => { this.inflight = null; });
    const value = await this.inflight;
    this.cache = { at: now.getTime(), value };
    return value;
  }

  private async build(now: Date): Promise<StatusSnapshot> {
    const [db, redis, payments, outbox, incidents] = await Promise.all([
      timed(() => this.prisma.withContext({ role: "SYSTEM" }, (tx) => tx.$queryRaw`SELECT 1`)),
      timed(() => this.kv.get("status:ping")),
      this.safe(() => this.paymentWindow(now), null),
      this.safe(() => this.outboxHealth(now), null),
      this.safe(() => this.incidents(now), []),
    ]);

    const components: Component[] = ([
      ["api", "operational"],
      ["database", probeStatus(db)],
      ["realtime", probeStatus(redis)],
      ["payments", db.ok && payments ? paymentStatus(payments) : db.ok ? "outage" : "operational"], // DB خراب ⇒ پرداخت را جدا قضاوت نمی‌کنیم (علت ریشه‌ای در database است)
      ["notifications", db.ok && outbox ? notificationsStatus(outbox) : "operational"],
    ] as [ComponentId, ComponentStatus][]).map(([id, status]) => ({ id, nameFa: COMPONENT_NAMES[id], status }));

    const active = incidents.filter((i) => i.status !== "RESOLVED");
    return { overall: applyIncidents(rollup(components), active), updatedAt: now.toISOString(), components, incidents };
  }

  private async safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try { return await withTimeout(fn(), PROBE_TIMEOUT_MS); } catch (e) { this.log.warn(`status probe failed: ${(e as Error).message}`); return fallback; }
  }

  private paymentWindow(now: Date): Promise<PaymentWindow> {
    const since = new Date(now.getTime() - PAYMENT_WINDOW_MIN * 60_000);
    const unsyncedBefore = new Date(now.getTime() - UNSYNCED_AFTER_MIN * 60_000);
    return this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const [groups, unsynced] = await Promise.all([
        tx.paymentAttempt.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
        tx.payment.count({ where: { status: "PAID", appointmentSyncedAt: null, paidAt: { lt: unsyncedBefore } } }),
      ]);
      const n = (s: string) => groups.find((g) => g.status === s)?._count._all ?? 0;
      return { paid: n("VERIFIED"), failed: n("FAILED"), expired: n("EXPIRED"), mismatch: n("MISMATCH"), paidUnsynced: unsynced };
    });
  }

  private outboxHealth(now: Date): Promise<{ oldestPendingSec: number; dead: number }> {
    return this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const [oldest, dead] = await Promise.all([
        tx.outboxEvent.findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
        tx.outboxEvent.count({ where: { status: "DEAD" } }),
      ]);
      return { oldestPendingSec: oldest ? Math.floor((now.getTime() - oldest.createdAt.getTime()) / 1000) : 0, dead };
    });
  }

  private incidents(now: Date): Promise<PublicIncident[]> {
    const since = new Date(now.getTime() - RECENT_DAYS * 86_400_000);
    return this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const rows = await tx.statusIncident.findMany({
        where: { OR: [{ resolvedAt: null }, { resolvedAt: { gte: since } }] },
        orderBy: { createdAt: "desc" }, take: 20,
        include: { updates: { orderBy: { createdAt: "asc" } } },
      });
      return rows.map((r) => ({
        id: r.id, titleFa: r.titleFa, status: r.status as IncidentStatus, impact: r.impact as IncidentImpact, componentId: (r.componentId ?? null) as ComponentId | null,
        startedAt: r.createdAt.toISOString(), resolvedAt: r.resolvedAt?.toISOString() ?? null,
        updates: r.updates.map((u) => ({ status: u.status as IncidentStatus, bodyFa: u.bodyFa, at: u.createdAt.toISOString() })),
      }));
    });
  }

  /** پس از ثبت/به‌روزرسانی حادثه، cache فوراً باطل شود. */
  invalidate(): void { this.cache = null; }
}
