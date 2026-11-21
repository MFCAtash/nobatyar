/**
 * یک اتصال SSE — منطق خالص (بدون Express/Nest؛ با sink و زمان‌سنج تزریقی قابل‌تست).
 *
 * ترتیب راه‌اندازی (برای «بدون فاصله و بدون گم‌شدن»):
 *   ۱) subscribe روی Redis و «انتظار برای تأیید»  — از این لحظه اعلان‌های زنده به بافر می‌آیند
 *   ۲) ارسال `ready`  — کلاینت می‌داند هر چه از این پس بسازد زنده می‌رسد؛ و هر چه قبلش ساخته شده در REST است
 *   ۳) اگر Last-Event-ID داریم: بازپخش از DB (اعلان‌های از دست‌رفته)
 *   ۴) تخلیه‌ی بافر زنده با حذف تکراری‌ها (id)  — سپس حالت عادی
 * پس از آن هر ۲۵ ثانیه heartbeat.
 */
import type { NotificationHub } from "./notification-hub";
import type { SseConfig } from "./sse-config";
import { formatComment, formatEvent, formatRetry, SSE_EVENT } from "./sse-format";
import type { NotificationEvent } from "./sse-format";

export interface SseSink {
  /** false = بافر نوشتن پر است (backpressure). */
  write(chunk: string): boolean;
  end(): void;
  /** بایت‌های هنوز ارسال‌نشده (res.writableLength). */
  backlogBytes(): number;
  /** وقتی کلاینت/proxy اتصال را بست. */
  onClose(cb: () => void): void;
}

export type ReplayResult =
  | { status: "ok"; items: NotificationEvent[] }
  | { status: "resync"; reason: "invalid_cursor" | "unknown_cursor" | "gap" };

export interface Timers {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(h: unknown): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
}

const REAL_TIMERS: Timers = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as NodeJS.Timeout),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
};

export type CloseReason = "client" | "lifetime" | "shutdown" | "slow_consumer" | "write_error" | "revoked";

export interface SseSessionDeps {
  userId: string;
  sink: SseSink;
  hub: Pick<NotificationHub, "subscribe">;
  replay(afterId: string): Promise<ReplayResult>;
  config: Pick<SseConfig, "heartbeatMs" | "maxBacklogBytes">;
  lifetimeMs: number;
  timers?: Timers;
  /** هر heartbeat پرسیده می‌شود؛ false ⇒ نشست باطل شده و اتصال بسته می‌شود (خطا ⇒ نگه‌دار). */
  stillValid?(): Promise<boolean>;
  onClosed?(reason: CloseReason): void;
  log?: { warn(message: string): void };
}

/** سقف شناسه‌های «ارسال‌شده» برای حذف تکراری و سقف بافرِ حین بازپخش. */
const SENT_CAP = 1000;
const BUFFER_CAP = 1000;
/** پیشنهاد فاصله‌ی reconnect به EventSource های بومی (کلاینت نوبتیار backoff ی خودش را دارد). */
const RETRY_MS = 3000;

export class SseSession {
  private closed = false;
  private catching = 0;
  private buffer: NotificationEvent[] = [];
  private overflowed = false;
  private readonly sent = new Set<string>();
  private lastId: string | undefined;
  private unsubscribe: (() => Promise<void>) | undefined;
  private hb: unknown;
  private life: unknown;
  private chain: Promise<void> = Promise.resolve();
  private readonly timers: Timers;

  constructor(private readonly d: SseSessionDeps) {
    this.timers = d.timers ?? REAL_TIMERS;
  }

  get isClosed(): boolean {
    return this.closed;
  }
  get lastEventId(): string | undefined {
    return this.lastId;
  }

  async start(lastEventId?: string): Promise<void> {
    this.d.sink.onClose(() => void this.close("client"));
    this.catching++; // تا پایان بازپخش، اعلان‌های زنده فقط بافر می‌شوند

    this.unsubscribe = await this.d.hub.subscribe(this.d.userId, {
      onNotification: (n) => this.onLive(n),
      onResync: () => this.requestCatchUp(),
    });
    if (this.closed) {
      // کلاینت وسط subscribe رفت
      await this.releaseSubscription();
      return;
    }

    this.write(formatRetry(RETRY_MS));
    this.write(formatEvent({ event: SSE_EVENT.READY, data: { heartbeatSec: Math.round(this.d.config.heartbeatMs / 1000) } }));

    if (lastEventId) await this.doCatchUp(lastEventId);
    this.catching--;
    if (this.catching === 0) this.drain();

    if (this.closed) return;
    this.hb = this.timers.setInterval(() => {
      this.write(formatComment("hb"));
      const check = this.d.stillValid;
      if (check && !this.closed) void check().then((ok) => { if (!ok) void this.close("revoked"); }, () => undefined);
    }, this.d.config.heartbeatMs);
    this.life = this.timers.setTimeout(() => void this.close("lifetime"), this.d.lifetimeMs);
  }

  /** بستن اتصال. idempotent. */
  async close(reason: CloseReason): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.hb !== undefined) this.timers.clearInterval(this.hb);
    if (this.life !== undefined) this.timers.clearTimeout(this.life);

    if (reason === "lifetime" || reason === "shutdown") {
      // به کلاینت می‌گوییم «خطا نیست؛ فوراً دوباره وصل شو»
      this.safeWrite(formatEvent({ event: SSE_EVENT.RECONNECT, data: { reason } }));
    }
    if (reason !== "client") {
      try {
        this.d.sink.end();
      } catch {
        /* قبلاً بسته شده */
      }
    }
    await this.releaseSubscription();
    this.d.onClosed?.(reason);
  }

  // ─────────────────────────── داخلی ───────────────────────────

  private async releaseSubscription(): Promise<void> {
    const u = this.unsubscribe;
    this.unsubscribe = undefined;
    if (u) await u().catch(() => undefined);
  }

  private onLive(n: NotificationEvent): void {
    if (this.closed) return;
    if (this.catching > 0) {
      if (this.buffer.length >= BUFFER_CAP) this.overflowed = true;
      else this.buffer.push(n);
      return;
    }
    this.emit(n);
  }

  private drain(): void {
    const items = this.buffer;
    this.buffer = [];
    if (this.overflowed) {
      this.overflowed = false;
      this.write(formatEvent({ event: SSE_EVENT.RESYNC, data: { reason: "overflow" } }));
    }
    for (const n of items) this.emit(n);
  }

  private emit(n: NotificationEvent): void {
    if (this.sent.has(n.id)) return;
    this.sent.add(n.id);
    if (this.sent.size > SENT_CAP) this.sent.delete(this.sent.values().next().value as string);
    this.lastId = n.id;
    this.write(formatEvent({ event: SSE_EVENT.NOTIFICATION, id: n.id, data: n }));
  }

  /** پس از بازگشت Redis: از آخرین id ی ارسالی جبران کن؛ اگر cursor نداریم کلاینت را به REST بفرست. */
  private requestCatchUp(): void {
    if (this.closed) return;
    const from = this.lastId;
    this.catching++;
    this.chain = this.chain
      .then(async () => {
        if (from) await this.doCatchUp(from);
        else this.write(formatEvent({ event: SSE_EVENT.RESYNC, data: { reason: "redis_reconnect" } }));
      })
      .finally(() => {
        this.catching--;
        if (this.catching === 0) this.drain();
      });
  }

  private async doCatchUp(afterId: string): Promise<void> {
    try {
      const r = await this.d.replay(afterId);
      if (this.closed) return;
      if (r.status === "resync") this.write(formatEvent({ event: SSE_EVENT.RESYNC, data: { reason: r.reason } }));
      else for (const n of r.items) this.emit(n);
    } catch (err) {
      this.d.log?.warn(`sse replay failed: ${err instanceof Error ? err.message : String(err)}`);
      this.write(formatEvent({ event: SSE_EVENT.RESYNC, data: { reason: "replay_failed" } }));
    }
  }

  private write(chunk: string): void {
    if (this.closed) return;
    this.safeWrite(chunk);
    if (!this.closed && this.d.sink.backlogBytes() > this.d.config.maxBacklogBytes) void this.close("slow_consumer");
  }

  private safeWrite(chunk: string): void {
    try {
      this.d.sink.write(chunk);
    } catch {
      void this.close("write_error");
    }
  }
}
