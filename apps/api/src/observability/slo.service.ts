import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../common/decorators";
import { moduleEnabled } from "../common/feature-flags";
import { PrismaService } from "../prisma/prisma.service";
import {
  alertSeverity,
  authorizeChaos,
  authorizeRunbook,
  burnRate,
  errorBudget,
  remainingBudgetPct,
  type BurnRateResult,
  type ChaosTarget,
  type SloTarget,
} from "./slo";
import type { ChaosInput, PutSloInput } from "./slo.schemas";

function requireFlag() {
  if (!moduleEnabled("FF_M11_AUTO_OPS")) throw new BadRequestException({ error: "module_disabled" });
}

@Injectable()
export class AutoOpsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async listSlo() {
    requireFlag();
    const rows = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.sloBudget.findMany({ orderBy: { service: "asc" } }),
    );
    return rows.map((r) => {
      const target: SloTarget = { service: r.service, objective: r.objective, window: r.window };
      // burnRate ذخیره‌شده از پایشگر می‌آید؛ نرخ خطای معادل = burn * budget.
      const budget = errorBudget(target);
      const errorRate = Math.max(0, r.burnRate) * budget;
      const results: BurnRateResult[] = [
        { window: "1h", burnRate: burnRate(target, errorRate), budget, significant: true },
      ];
      return {
        ...r,
        errorRate,
        remainingBudgetPct: remainingBudgetPct(target, errorRate),
        severity: alertSeverity(results),
      };
    });
  }

  async putSlo(user: AuthUser, service: string, input: PutSloInput) {
    requireFlag();
    if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(service)) throw new BadRequestException({ error: "invalid_service" });
    const row = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.sloBudget.upsert({
        where: { service },
        update: { objective: input.objective, window: input.window },
        create: { service, objective: input.objective, window: input.window, burnRate: 0 },
      }),
    );
    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: "ops.slo.update",
      objectType: "slo_budgets",
      objectId: service,
      meta: { objective: input.objective, window: input.window },
    });
    return row;
  }

  async listChaos() {
    requireFlag();
    return this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.chaosDrill.findMany({ orderBy: { at: "desc" }, take: 100 }),
    );
  }

  async runChaos(user: AuthUser, target: ChaosTarget, input: ChaosInput) {
    requireFlag();
    const now = new Date();
    const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const decision = authorizeChaos({
      target,
      environment: process.env.NODE_ENV ?? "development",
      nowMinutes,
      windowFrom: input.windowFrom,
      windowTo: input.windowTo,
      approved: input.approved,
    });
    const result = decision.allowed ? "ALLOWED" : `BLOCKED:${decision.reason}`;
    const row = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.chaosDrill.create({ data: { target, result, at: now } }),
    );
    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: "ops.chaos.run",
      objectType: "chaos_drills",
      objectId: row.id,
      meta: { target, result },
    });
    if (!decision.allowed) throw new ForbiddenException({ error: decision.reason, drillId: row.id });
    return { ...row, autoRollback: decision.autoRollback };
  }

  async runRunbook(user: AuthUser, name: string) {
    requireFlag();
    const env = process.env.NODE_ENV ?? "development";
    const d = authorizeRunbook(name, env);
    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: "ops.runbook.run",
      objectType: "runbook",
      objectId: name,
      meta: { allowed: d.allowed, reason: d.reason },
    });
    if (!d.allowed) throw new ForbiddenException({ error: d.reason });
    // اجرای واقعی runbook در CI/اپراتور انجام می‌شود؛ این endpoint فقط مجوز و رد حسابرسی می‌سازد.
    return { name, scheduled: true, environment: env };
  }

  async synthetic() {
    requireFlag();
    const started = Date.now();
    let db = false;
    try {
      await this.prisma.withContext({ role: "SYSTEM" }, (tx) => tx.$queryRaw`SELECT 1`);
      db = true;
    } catch {
      db = false;
    }
    return {
      ok: db,
      latencyMs: Date.now() - started,
      checks: [{ name: "postgres", ok: db }],
      at: new Date().toISOString(),
    };
  }
}
