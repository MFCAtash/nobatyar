import { Body, Controller, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import type { AuthUser } from "../common/decorators";
import { CurrentUser, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { AutoOpsService } from "./slo.service";
import {
  chaosSchema,
  chaosTargetSchema,
  putSloSchema,
  runbookSchema,
  type ChaosInput,
  type PutSloInput,
} from "./slo.schemas";
import type { ChaosTarget } from "./slo";

@Controller("admin")
@Roles("ADMIN")
export class AutoOpsAdminController {
  constructor(private readonly svc: AutoOpsService) {}

  @Get("slo")
  slo() {
    return this.svc.listSlo();
  }

  @Put("slo/:service")
  putSlo(
    @CurrentUser() user: AuthUser,
    @Param("service") service: string,
    @Body(new ZodPipe(putSloSchema)) body: PutSloInput,
  ) {
    return this.svc.putSlo(user, service, body);
  }

  @Get("chaos")
  chaos() {
    return this.svc.listChaos();
  }

  @HttpCode(201)
  @Post("chaos/:target")
  runChaos(
    @CurrentUser() user: AuthUser,
    @Param("target", new ZodPipe(chaosTargetSchema)) target: ChaosTarget,
    @Body(new ZodPipe(chaosSchema)) body: ChaosInput,
  ) {
    return this.svc.runChaos(user, target, body);
  }

  @HttpCode(200)
  @Post("runbooks")
  runbook(@CurrentUser() user: AuthUser, @Body(new ZodPipe(runbookSchema)) body: { name: string }) {
    return this.svc.runRunbook(user, body.name);
  }

  @Get("synthetic")
  synthetic() {
    return this.svc.synthetic();
  }
}
