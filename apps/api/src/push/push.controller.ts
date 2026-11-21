import { Body, Controller, Get, Inject, Post } from "@nestjs/common";
import { CurrentUser } from "../common/decorators";
import type { AuthUser } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { PushService } from "./push.service";
import { SubscribeSchema, UnsubscribeSchema } from "./push.schemas";
import type { SubscribeInput, UnsubscribeInput } from "./push.schemas";

/** هر کاربر واردشده (بیمار/پزشک) می‌تواند برای دستگاه خودش پوش بگیرد. */
@Controller("push")
export class PushController {
  constructor(@Inject(PushService) private readonly svc: PushService) {}

  @Get("public-key")
  publicKey() { return this.svc.publicKey(); }

  @Post("subscribe")
  subscribe(@CurrentUser() user: AuthUser, @Body(new ZodPipe(SubscribeSchema)) dto: SubscribeInput) { return this.svc.subscribe(user, dto); }

  @Post("unsubscribe")
  unsubscribe(@CurrentUser() user: AuthUser, @Body(new ZodPipe(UnsubscribeSchema)) dto: UnsubscribeInput) { return this.svc.unsubscribe(user, dto.endpoint); }
}
