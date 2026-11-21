import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import type { Request, Response } from "express";
import type { AuthUser } from "../common/decorators";
import { SessionRevocation } from "../auth/session-revocation";
import { NotificationHub } from "./notification-hub";
import { NotificationService } from "./notification.service";
import { SSE_CONFIG } from "./sse-config";
import type { SseConfig } from "./sse-config";
import { applySseHeaders, lastEventIdOf, responseSink } from "./sse-http";
import { SseSession } from "./sse-session";

/**
 * مدیر اتصال‌های SSE اعلان در این نمونه‌ی API: سقف اتصال هر کاربر، ساخت session، و بستن تمیز هنگام خاموشی.
 */
@Injectable()
export class NotificationStreamService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationStreamService.name);
  private readonly sessions = new Map<string, Set<SseSession>>();

  constructor(
    @Inject(NotificationHub)     private readonly hub:   NotificationHub,
    @Inject(NotificationService) private readonly notif: NotificationService,
    @Inject(SSE_CONFIG)          private readonly cfg:   SseConfig,
    @Inject(SessionRevocation)   private readonly revocation: SessionRevocation,
  ) {}

  get openStreams(): number {
    let n = 0;
    for (const s of this.sessions.values()) n += s.size;
    return n;
  }

  async open(user: AuthUser, req: Request, res: Response, lifetimeMs: number): Promise<void> {
    const mine = this.sessions.get(user.id);
    if ((mine?.size ?? 0) >= this.cfg.maxStreamsPerUser) {
      res.setHeader("Retry-After", "10");
      res.status(429).json({ error: "too_many_streams" });
      return;
    }

    // اتصال بلندمدت: بدون timeout ی سوکت، بدون تأخیر Nagle، با keep-alive ی TCP
    req.socket.setTimeout(0);
    req.socket.setNoDelay(true);
    req.socket.setKeepAlive(true, 30_000);

    applySseHeaders(res);

    const session: SseSession = new SseSession({
      userId: user.id,
      sink: responseSink(res),
      hub: this.hub,
      replay: (afterId) => this.notif.replayAfter(user.id, afterId, this.cfg.replayMax),
      config: this.cfg,
      lifetimeMs,
      stillValid: async () => (await this.revocation.recheck({ sub: user.id, sid: user.sid, iatMs: user.iatMs })) !== "revoked",
      log: this.logger,
      onClosed: () => {
        const set = this.sessions.get(user.id);
        set?.delete(session);
        if (set && set.size === 0) this.sessions.delete(user.id);
      },
    });
    const set = mine ?? new Set<SseSession>();
    set.add(session);
    this.sessions.set(user.id, set);

    await session.start(lastEventIdOf(req));
  }

  /** پیش از بستن HTTP server صدا زده می‌شود؛ وگرنه اتصال‌های بی‌پایان، shutdown را معلق می‌کنند. */
  async onModuleDestroy(): Promise<void> {
    const all = [...this.sessions.values()].flatMap((s) => [...s]);
    await Promise.all(all.map((s) => s.close("shutdown")));
  }
}
