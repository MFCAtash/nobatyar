import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import type { AuthUser } from "../common/decorators";
import { CurrentUser, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { moduleEnabled } from "../common/feature-flags";
import { NotificationPreferencesService } from "./preferences.service";
import {
  activateTemplateSchema,
  putPreferencesSchema,
  type ActivateTemplateInput,
  type PutPreferencesInput,
} from "./preferences.schemas";

function requireFlag() {
  if (!moduleEnabled("FF_M5_NOTIF_ORCHESTRATOR")) throw new BadRequestException({ error: "module_disabled" });
}

@Controller("me")
export class NotificationPreferencesController {
  constructor(private readonly svc: NotificationPreferencesService) {}

  @Get("notification-preferences")
  get(@CurrentUser() user: AuthUser) {
    requireFlag();
    return this.svc.get(user);
  }

  @Put("notification-preferences")
  put(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(putPreferencesSchema)) body: PutPreferencesInput,
  ) {
    requireFlag();
    return this.svc.put(user, body);
  }
}

@Controller("admin")
@Roles("ADMIN")
export class NotificationAdminController {
  constructor(private readonly svc: NotificationPreferencesService) {}

  @Get("notification-templates")
  templates(@CurrentUser() user: AuthUser) {
    requireFlag();
    return this.svc.listTemplates(user);
  }

  @Post("notification-templates/:key/activate")
  activate(
    @CurrentUser() user: AuthUser,
    @Param("key") key: string,
    @Body(new ZodPipe(activateTemplateSchema)) body: ActivateTemplateInput,
  ) {
    requireFlag();
    return this.svc.activateTemplate(user, key, body.version);
  }

  @Get("dead-letters")
  deadLetters(@CurrentUser() user: AuthUser, @Query("limit") limit?: string) {
    requireFlag();
    const n = Number(limit ?? 50);
    return this.svc.deadLetters(user, Number.isFinite(n) ? n : 50);
  }

  @Post("dead-letters/:id/retry")
  retry(@CurrentUser() user: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    requireFlag();
    return this.svc.retryDeadLetter(user, id);
  }
}
