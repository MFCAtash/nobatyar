import { Controller, Get, Header, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { AuthUser, CurrentUser, Public, Roles } from "../common/decorators";
import { VideoService } from "./video.service";

@Controller("appointments/:id/video")
export class VideoController {
  constructor(@Inject(VideoService) private readonly svc: VideoService) {}

  /** پنجره‌ی ورود و وضعیت — برای فعال/غیرفعال‌کردن دکمه‌ی «ورود به ویزیت». */
  @Roles("PATIENT", "DOCTOR")
  @Header("Cache-Control", "no-store")
  @Get()
  status(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.status(u, id);
  }

  /** توکن کوتاه‌مدت LiveKit. هرگز کش نشود. */
  @Roles("PATIENT", "DOCTOR")
  @Header("Cache-Control", "no-store")
  @HttpCode(200)
  @Post("token")
  join(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.join(u, id);
  }
}

@Controller("video")
export class VideoWebhookController {
  constructor(@Inject(VideoService) private readonly svc: VideoService) {}

  /**
   * webhook ی LiveKit — بدون JWT کاربر؛ اصالت با امضای HMAC و هش بدنه‌ی «خام» تأیید می‌شود.
   * بدنه در main.ts برای همین مسیر به‌صورت متن خام خوانده می‌شود.
   */
  @Public()
  @HttpCode(200)
  @Post("webhook")
  webhook(@Req() req: Request, @Headers("authorization") auth?: string) {
    return this.svc.handleWebhook((req as Request & { body: unknown }).body, auth);
  }
}
