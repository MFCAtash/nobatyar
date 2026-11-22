import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../common/decorators";
import { moduleEnabled } from "../common/feature-flags";
import { PrismaService } from "../prisma/prisma.service";
import {
  anonymousId,
  classifyNps,
  computeCohorts,
  computeFunnel,
  hashMeta,
  npsScore,
  sanitizeMeta,
  FunnelError,
} from "./funnel";
import type { ExperimentUpsertInput, FeedbackInput, FunnelEventInput } from "./funnel.schemas";

function requireFlag() {
  if (!moduleEnabled("FF_M13_PRODUCT_ANALYTICS")) throw new BadRequestException({ error: "module_disabled" });
}

/** salt تحلیل: در production الزامی و حداقل ۳۲ کاراکتر؛ در dev fallback صریح. */
export function analyticsSalt(env: NodeJS.ProcessEnv = process.env): string {
  const salt = env.ANALYTICS_SALT ?? env.BLIND_INDEX_KEY;
  if (salt && salt.length >= 32) return salt;
  if (env.NODE_ENV === "production") throw new Error("ANALYTICS_SALT (>=32 chars) is required in production");
  return "dev-only-analytics-salt-do-not-use-in-production";
}

@Injectable()
export class FunnelService {
  private readonly salt = analyticsSalt();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async record(user: AuthUser, input: FunnelEventInput) {
    requireFlag();
    let meta: Record<string, string>;
    let anon: string;
    try {
      meta = sanitizeMeta(input.meta);
      anon = anonymousId(input.anonymousId, this.salt);
    } catch (e) {
      throw new BadRequestException({ error: "invalid_event", message: (e as Error).message });
    }
    const metaHash = hashMeta(meta, this.salt);
    await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.funnelEvent.create({ data: { anonymousId: anon, step: input.step, metaHash } }),
    );
    return { ok: true };
  }

  async report(user: AuthUser, q: { from?: string; to?: string; maxWeeks?: number }) {
    requireFlag();
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * 86_400_000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      throw new BadRequestException({ error: "invalid_range" });
    }
    const events = await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.funnelEvent.findMany({
        where: { at: { gte: from, lte: to } },
        select: { anonymousId: true, step: true, at: true },
        orderBy: { at: "asc" },
        take: 50_000,
      }),
    );
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      funnel: computeFunnel(events),
      cohorts: computeCohorts(events, { maxWeeks: q.maxWeeks ?? 8 }),
      totalEvents: events.length,
    };
  }

  async submitFeedback(user: AuthUser, input: FeedbackInput) {
    requireFlag();
    let bucket;
    try {
      bucket = classifyNps(input.score);
    } catch (e) {
      throw new BadRequestException({ error: "invalid_score", message: (e as Error).message });
    }
    const anon = anonymousId(input.anonymousId ?? user.id, this.salt);
    await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.productFeedback.create({
        data: { userId: user.id, anonymousId: anon, score: input.score, step: input.step ?? null },
      }),
    );
    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: "analytics.feedback.submit",
      objectType: "product_feedback",
      meta: { bucket },
    });
    return { ok: true, bucket };
  }

  async feedbackReport(user: AuthUser) {
    requireFlag();
    const rows = await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.productFeedback.findMany({ select: { score: true, at: true }, orderBy: { at: "desc" }, take: 10_000 }),
    );
    return { count: rows.length, nps: npsScore(rows.map((r) => r.score)) };
  }

  async listExperiments(user: AuthUser) {
    requireFlag();
    return this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.experiment.findMany({ orderBy: { key: "asc" } }),
    );
  }

  async upsertExperiment(user: AuthUser, key: string, input: ExperimentUpsertInput) {
    requireFlag();
    if (!/^[a-z0-9][a-z0-9_-]{1,40}$/.test(key)) throw new BadRequestException({ error: "invalid_key" });
    const variants = [...new Set(input.variants)];
    const row = await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.experiment.upsert({
        where: { key },
        update: { variants: JSON.stringify(variants), enabled: input.enabled },
        create: { key, variants: JSON.stringify(variants), enabled: input.enabled },
      }),
    );
    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: "analytics.experiment.upsert",
      objectType: "experiments",
      objectId: key,
      meta: { enabled: input.enabled, variants: variants.length },
    });
    return row;
  }
}
