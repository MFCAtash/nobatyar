import { Body, Controller, Get, Put } from "@nestjs/common";
import type { AuthUser } from "../common/decorators";
import { CurrentUser } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { UiPreferencesService } from "./ui-preferences.service";
import { uiPreferencesSchema, type UiPreferencesInput } from "./ui-preferences.schemas";

@Controller("me")
export class UiPreferencesController {
  constructor(private readonly svc: UiPreferencesService) {}

  @Get("ui-preferences")
  get(@CurrentUser() user: AuthUser) {
    return this.svc.get(user);
  }

  @Put("ui-preferences")
  put(@CurrentUser() user: AuthUser, @Body(new ZodPipe(uiPreferencesSchema)) body: UiPreferencesInput) {
    return this.svc.put(user, body);
  }
}
