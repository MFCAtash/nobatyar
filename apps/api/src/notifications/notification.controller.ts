import {
  Controller, Get, Patch, Param, ParseUUIDPipe,
  Query, Req, Res, UseGuards, Inject,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { decodeJwt } from "jose";
import { JwtGuard } from "../auth/guards";
import { CurrentUser } from "../common/decorators";
import type { AuthUser } from "../common/decorators";
import { NotificationService } from "./notification.service";
import { NotificationStreamService } from "./notification-stream.service";
import { SSE_CONFIG, streamLifetimeMs } from "./sse-config";
import type { SseConfig } from "./sse-config";

@Controller("notifications")
@UseGuards(JwtGuard)
export class NotificationController {
  constructor(
    @Inject(NotificationService)       private readonly svc:     NotificationService,
    @Inject(NotificationStreamService) private readonly streams: NotificationStreamService,
    @Inject(SSE_CONFIG)                private readonly cfg:     SseConfig,
  ) {}

  /**
   * SSE — جریان زنده‌ی اعلان‌های «همین کاربر» (از همه‌ی نمونه‌های API، با Redis pub/sub).
   *
   * احراز هویت: هدر `Authorization: Bearer` (EventSource ی بومی نمی‌تواند هدر بفرستد ⇒ کلاینت وب از fetch استفاده می‌کند؛
   * توکن هرگز در URL نمی‌آید تا در لاگ proxy و تاریخچه نماند).
   * بازیابی: `Last-Event-ID` (= id آخرین اعلان دریافتی) ⇒ اعلان‌های از دست‌رفته از DB بازپخش می‌شوند.
   */
  @Get("stream")
  async stream(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.streams.open(user, req, res, this.lifetimeFor(req));
  }

  /** لیست اعلان‌ها */
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("unread") unread?: string,
    @Query("cursor") cursor?: string,
  ) {
    return this.svc.list(user.id, {
      unreadOnly: unread === "1",
      cursor,
    });
  }

  /** علامت یک اعلان خوانده */
  @Patch(":id/read")
  markRead(
    @CurrentUser() user: AuthUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.svc.markRead(user.id, id);
  }

  /** همه را خوانده کن */
  @Patch("read-all")
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.svc.markAllRead(user.id);
  }

  /** عمر stream = min(سقف تنظیمی، زمان باقی‌مانده‌ی access token). توکن را guard پیش‌تر تأیید کرده است. */
  private lifetimeFor(req: Request): number {
    const m = req.headers.authorization?.match(/^Bearer (\S+)$/);
    let exp: number | undefined;
    try {
      exp = m ? decodeJwt(m[1]).exp : undefined;
    } catch {
      exp = undefined;
    }
    return streamLifetimeMs(exp, Date.now(), this.cfg.maxLifetimeMs);
  }
}
