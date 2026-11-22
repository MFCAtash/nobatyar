import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import type { AuthUser } from "../common/decorators";
import { CurrentUser, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { FunnelService } from "./funnel.service";
import {
  experimentUpsertSchema,
  feedbackSchema,
  funnelEventSchema,
  funnelQuerySchema,
  type ExperimentUpsertInput,
  type FeedbackInput,
  type FunnelEventInput,
} from "./funnel.schemas";

@Controller("analytics")
export class FunnelController {
  constructor(private readonly svc: FunnelService) {}

  @HttpCode(201)
  @Post("funnel")
  record(@CurrentUser() user: AuthUser, @Body(new ZodPipe(funnelEventSchema)) body: FunnelEventInput) {
    return this.svc.record(user, body);
  }
}

@Controller("me")
export class FeedbackController {
  constructor(private readonly svc: FunnelService) {}

  @HttpCode(201)
  @Post("feedback")
  submit(@CurrentUser() user: AuthUser, @Body(new ZodPipe(feedbackSchema)) body: FeedbackInput) {
    return this.svc.submitFeedback(user, body);
  }

  @Get("feedback")
  report(@CurrentUser() user: AuthUser) {
    return this.svc.feedbackReport(user);
  }
}

@Controller("admin/analytics")
@Roles("ADMIN")
export class AnalyticsAdminController {
  constructor(private readonly svc: FunnelService) {}

  @Get("funnel")
  funnel(
    @CurrentUser() user: AuthUser,
    @Query(new ZodPipe(funnelQuerySchema)) q: { from?: string; to?: string; maxWeeks?: number },
  ) {
    return this.svc.report(user, q);
  }

  @Get("cohorts")
  cohorts(
    @CurrentUser() user: AuthUser,
    @Query(new ZodPipe(funnelQuerySchema)) q: { from?: string; to?: string; maxWeeks?: number },
  ) {
    return this.svc.report(user, q);
  }

  @Get("experiments")
  experiments(@CurrentUser() user: AuthUser) {
    return this.svc.listExperiments(user);
  }

  @Put("experiments/:key")
  upsert(
    @CurrentUser() user: AuthUser,
    @Param("key") key: string,
    @Body(new ZodPipe(experimentUpsertSchema)) body: ExperimentUpsertInput,
  ) {
    return this.svc.upsertExperiment(user, key, body);
  }
}
