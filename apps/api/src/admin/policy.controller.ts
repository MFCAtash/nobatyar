import { Body, Controller, Get, HttpCode, Inject, NotFoundException, Post } from "@nestjs/common";
import {
  APPOINTMENT_POLICY, assertPolicyInvariants, evaluateTransition, simulateRefund, toMermaid,
  TRANSITION_POLICY_VERSION,
} from "@nobatyar/shared";
import { Roles as RolesDecorator, CurrentUser } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { SCHEDULING_CONFIG, type SchedulingConfig } from "../scheduling/config";
import { moduleEnabled } from "../common/feature-flags";
import { activateSchema, simulateSchema, type SimulateInput } from "./policy.schemas";

/** M2: مشاهده و شبیهسازی قواعد ماشین وضعیت — بدون نوشتن دیتابیس پزشکی. */
@Controller("admin/policies")
export class PolicyController {
  constructor(
    @Inject(SCHEDULING_CONFIG) private readonly cfg: SchedulingConfig,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  private requireFlag() {
    if (!moduleEnabled("FF_M2_STATE_POLICY")) {
      throw new NotFoundException({ error: "module_disabled" });
    }
  }

  @Get()
  @RolesDecorator("ADMIN")
  list() {
    this.requireFlag();
    return {
      aggregate: APPOINTMENT_POLICY.aggregate,
      version: APPOINTMENT_POLICY.version,
      rules: APPOINTMENT_POLICY.rules,
      mermaid: toMermaid(APPOINTMENT_POLICY),
      invariants: assertPolicyInvariants(APPOINTMENT_POLICY),
    };
  }

  @Post("simulate")
  @RolesDecorator("ADMIN")
  @HttpCode(200)
  simulate(@Body(new ZodPipe(simulateSchema)) body: SimulateInput) {
    this.requireFlag();
    const now = body.now ? new Date(body.now) : new Date();
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    const facts = { status: body.from, startsAt, endsAt, autoConfirm: body.autoConfirm };
    const plan = evaluateTransition(APPOINTMENT_POLICY, body.action, facts, now, this.cfg);
    const refund = body.paidRial
      ? simulateRefund(body.action, BigInt(body.paidRial), startsAt, now, this.cfg)
      : null;
    const rule = APPOINTMENT_POLICY.rules.find((r) => r.action === body.action);
    return {
      plan,
      rule: rule ?? null,
      refund: refund ? { percent: refund.percent, amountRial: refund.amountRial.toString() } : null,
      steps: [
        `وضعیت فعلی: ${body.from}`,
        `اقدام: ${body.action} توسط ${rule?.actor ?? "system"}`,
        plan.ok ? `انتقال به ${plan.to}` : `رد شد: ${plan.error}`,
        refund ? `بازپرداخت ${refund.percent}%` : "بدون بازپرداخت",
      ],
    };
  }

  @Post(":version/activate")
  @RolesDecorator("ADMIN")
  @HttpCode(200)
  async activate(@Body(new ZodPipe(activateSchema)) body: { version: number }, @CurrentUser() admin: { id: string }) {
    this.requireFlag();
    if (body.version !== TRANSITION_POLICY_VERSION) {
      return { ok: false, error: "unknown_version", active: TRANSITION_POLICY_VERSION };
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.role', 'SYSTEM', true)`;
      await this.audit.logIn(tx, {
        actorId: admin.id, actorRole: "ADMIN", action: "policy.activated",
        objectType: "policy", objectId: `v${body.version}`, meta: { aggregate: "APPOINTMENT" },
      });
    });
    return { ok: true, version: body.version };
  }
}
