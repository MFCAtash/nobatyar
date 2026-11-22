import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from "@nestjs/common";
import type { AuthUser } from "../common/decorators";
import { CurrentUser, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { GrowthService } from "./clinics.service";
import {
  clinicQuerySchema,
  createClinicSchema,
  createPlanSchema,
  seatsQuerySchema,
  workspaceSchema,
  type CreateClinicInput,
  type CreatePlanInput,
  type WorkspaceInput,
} from "./clinics.schemas";

@Controller()
export class GrowthController {
  constructor(private readonly svc: GrowthService) {}

  @Get("clinics")
  clinics(
    @CurrentUser() user: AuthUser,
    @Query(new ZodPipe(clinicQuerySchema))
    q: { lat?: number; lng?: number; maxKm?: number; q?: string; verifiedOnly?: "0" | "1"; limit?: number },
  ) {
    return this.svc.clinics(user, q);
  }

  @Roles("DOCTOR")
  @Get("me/workspace")
  workspace(@CurrentUser() user: AuthUser) {
    return this.svc.getWorkspace(user);
  }

  @Roles("DOCTOR")
  @Put("me/workspace")
  putWorkspace(@CurrentUser() user: AuthUser, @Body(new ZodPipe(workspaceSchema)) body: WorkspaceInput) {
    return this.svc.putWorkspace(user, body);
  }
}

@Controller("admin")
@Roles("ADMIN")
export class GrowthAdminController {
  constructor(private readonly svc: GrowthService) {}

  @HttpCode(201)
  @Post("clinics")
  createClinic(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createClinicSchema)) body: CreateClinicInput) {
    return this.svc.createClinic(user, body);
  }

  @Patch("clinics/:id/verify")
  verify(@CurrentUser() user: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.verifyClinic(user, id);
  }

  @Get("organization-plans")
  plans(@CurrentUser() user: AuthUser) {
    return this.svc.listPlans(user);
  }

  @HttpCode(201)
  @Post("organization-plans")
  createPlan(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createPlanSchema)) body: CreatePlanInput) {
    return this.svc.createPlan(user, body);
  }

  @Get("organization-plans/:id/seats")
  seats(
    @CurrentUser() user: AuthUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query(new ZodPipe(seatsQuerySchema)) q: { used: number },
  ) {
    return this.svc.checkPlanSeats(user, id, q.used);
  }
}
