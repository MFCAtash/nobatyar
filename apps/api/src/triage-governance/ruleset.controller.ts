import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import type { AuthUser } from "../common/decorators";
import { CurrentUser, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { TriageGovernanceService } from "./ruleset.service";
import {
  createRuleSetSchema,
  evaluateSchema,
  type CreateRuleSetInput,
  type EvaluateInput,
} from "./ruleset.schemas";

@Controller("triage-governance")
export class TriageGovernanceController {
  constructor(private readonly svc: TriageGovernanceService) {}

  @Get("rulesets/active")
  active(@CurrentUser() user: AuthUser) {
    return this.svc.active(user);
  }

  @HttpCode(200)
  @Post("evaluate")
  evaluate(@CurrentUser() user: AuthUser, @Body(new ZodPipe(evaluateSchema)) body: EvaluateInput) {
    return this.svc.evaluate(user, body.symptoms);
  }

  @HttpCode(200)
  @Post("rulesets/:version/evaluate")
  evaluateVersion(
    @CurrentUser() user: AuthUser,
    @Param("version") version: string,
    @Body(new ZodPipe(evaluateSchema)) body: EvaluateInput,
  ) {
    return this.svc.evaluateWithVersion(user, version, body.symptoms);
  }
}

@Controller("admin/triage-rulesets")
@Roles("ADMIN")
export class TriageGovernanceAdminController {
  constructor(private readonly svc: TriageGovernanceService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.svc.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createRuleSetSchema)) body: CreateRuleSetInput) {
    return this.svc.create(user, body);
  }
}
