import { createHash, timingSafeEqual } from "node:crypto";
import { Controller, Get, Headers, Inject, NotFoundException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { Public } from "../common/decorators";
import { PrismaService } from "../prisma/prisma.service";
import { KV_STORE } from "../redis/kv-store";
import type { KeyValueStore } from "../redis/kv-store";
import { gatewayCalls, gatewayDuration, httpDuration, httpRequests, outboxDead, paymentOutcomes, outboxProcessed, outboxRetried, refundExec, renderMetrics, scribePurged } from "./metrics";
import type { GaugeSample } from "./metrics";
import { OPS_CONFIG } from "./ops.config";
import type { OpsConfig } from "./ops.config";

const sha = (s: string) => createHash("sha256").update(s).digest();
const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

/**
 * /health/ready — آمادگی (DB + Redis) برای load balancer/پایش؛ فقط بولین‌ها، بدون جزئیات خطا.
 * /metrics — Prometheus، با Bearer ثابت (fail-closed: بدون METRICS_TOKEN ⇒ ۴۰۴). در Caddy از بیرون مسدود است.
 */
@Controller()
export class OpsController {
  private cache?: { at: number; gauges: { name: string; help: string; samples: GaugeSample[] }[] };

  constructor(
    @Inject(OPS_CONFIG) private readonly cfg: OpsConfig,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(KV_STORE) private readonly kv: KeyValueStore,
  ) {}

  @Public()
  @Get("health/ready")
  async ready() {
    const [db, redis] = await Promise.all([
      withTimeout(this.prisma.withContext({ role: "SYSTEM" }, (tx) => tx.$queryRaw`SELECT 1`), 2000).then(() => true, () => false),
      withTimeout(this.kv.get("__ready__"), 2000).then(() => true, () => false),
    ]);
    const body = { status: db && redis ? ("ok" as const) : ("degraded" as const), db, redis };
    if (!(db && redis)) throw new ServiceUnavailableException(body);
    return body;
  }

  @Public()
  @Get("metrics")
  async metrics(@Headers("authorization") auth?: string): Promise<string> {
    if (!this.cfg.metricsToken) throw new NotFoundException();
    const presented = auth?.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!timingSafeEqual(sha(presented), sha(this.cfg.metricsToken))) throw new UnauthorizedException();
    return renderMetrics([httpRequests, httpDuration, gatewayCalls, gatewayDuration, paymentOutcomes, refundExec, outboxProcessed, outboxRetried, outboxDead, scribePurged], await this.business());
  }

  /** شاخص‌های کسب‌وکار از DB (کش ۱۵ ثانیه؛ هر نمونه‌ی API یکسان می‌دهد ⇒ در PromQL از max استفاده کنید). */
  private async business() {
    if (this.cache && Date.now() - this.cache.at < 15_000) return this.cache.gauges;
    const hourAgo = new Date(Date.now() - 3600_000);
    const staleBefore = new Date(Date.now() - 30 * 60_000);
    const gauges = await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const [refunds, paidUnsynced, staleInit, mismatch, paid1h, failed1h, booked1h, outbox, oldestPending, approvalsWaiting] = await Promise.all([
        tx.refund.groupBy({ by: ["status"], _count: { _all: true } }),
        tx.payment.count({ where: { status: "PAID", appointmentSyncedAt: null } }),
        tx.payment.count({ where: { status: "INITIATED", createdAt: { lt: staleBefore } } }),
        tx.paymentAttempt.count({ where: { status: "MISMATCH" } }),
        tx.payment.count({ where: { status: "PAID", paidAt: { gte: hourAgo } } }),
        tx.paymentAttempt.count({ where: { status: "FAILED", updatedAt: { gte: hourAgo } } }),
        tx.appointment.count({ where: { createdAt: { gte: hourAgo } } }),
        tx.outboxEvent.groupBy({ by: ["status"], _count: { _all: true } }),
        tx.outboxEvent.findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
        tx.refund.count({ where: { approvalState: "REQUESTED", requestedAt: { lt: new Date(Date.now() - 3600_000) } } }),
      ]);
      return [
        { name: "nobatyar_refunds", help: "Refunds by status", samples: refunds.map((g) => ({ labels: { status: g.status }, value: g._count._all })) },
        { name: "nobatyar_payments_attention", help: "Payments needing attention", samples: [
          { labels: { kind: "paid_unsynced" }, value: paidUnsynced }, { labels: { kind: "stale_initiated" }, value: staleInit }, { labels: { kind: "mismatch_attempt" }, value: mismatch },
        ] },
        { name: "nobatyar_outbox", help: "Outbox events by status", samples: outbox.map((g) => ({ labels: { status: g.status }, value: g._count._all })) },
        { name: "nobatyar_outbox_oldest_pending_seconds", help: "Age of the oldest PENDING outbox event", samples: [{ labels: {}, value: oldestPending ? Math.floor((Date.now() - oldestPending.createdAt.getTime()) / 1000) : 0 }] },
        { name: "nobatyar_refund_approvals_waiting", help: "Refund approval requests waiting for a checker for more than 1 hour", samples: [{ labels: {}, value: approvalsWaiting }] },
        { name: "nobatyar_business_last_hour", help: "Business events in the last hour", samples: [
          { labels: { event: "payment_paid" }, value: paid1h }, { labels: { event: "payment_attempt_failed" }, value: failed1h }, { labels: { event: "appointment_created" }, value: booked1h },
        ] },
      ];
    });
    this.cache = { at: Date.now(), gauges };
    return gauges;
  }
}
