/**
 * Hub اعلان‌ها روی Redis Pub/Sub — منطق خالص (بدون Nest/ioredis؛ قابل‌تست با InMemoryPubSub).
 *
 * طراحی:
 *  - «یک کانال به‌ازای هر کاربر»: `nb:notif:user:<userId>`. نمونه‌ای که SSE یک کاربر را دارد، همان کانال را می‌شنود.
 *  - «یک اتصال subscriber برای کل پروسه» (جدا از publisher)، نه یک اتصال به‌ازای هر کاربر/تب.
 *    کانال فقط تا وقتی شنونده‌ی محلی دارد subscribe می‌ماند (refcount) ⇒ هزینه‌ی Redis ∝ کاربرانِ «متصل».
 *  - Redis فقط «مسیر سریع» است؛ منبع حقیقت DB است. پیام گم‌شده را بازپخش از DB (Last-Event-ID) جبران می‌کند.
 *  - اگر Redis قطع بود: publish به شنونده‌های «محلی» تحویل می‌دهد (single-instance سالم می‌ماند) و
 *    هنگام بازگشت subscriber، همه‌ی شنونده‌ها `onResync` می‌گیرند تا از DB جبران کنند.
 */
import type { NotificationEvent } from "./sse-format";
import type { PubSubPublisher, PubSubSubscriber } from "../redis/pubsub";

export const CHANNEL_PREFIX = "nb:notif:user:";
export const userChannel = (userId: string): string => CHANNEL_PREFIX + userId;

export interface HubListener {
  onNotification(n: NotificationEvent): void;
  /** پیام‌هایی ممکن است گم شده باشد (بازگشت اتصال Redis) ⇒ از DB جبران کنید. */
  onResync(): void;
}

export interface HubLogger {
  warn(message: string): void;
  error(message: string, trace?: unknown): void;
}

const NOOP_LOG: HubLogger = { warn: () => undefined, error: () => undefined };

export class NotificationHub {
  private readonly channels = new Map<string, Set<HubListener>>();
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly pub: PubSubPublisher,
    private readonly sub: PubSubSubscriber,
    private readonly log: HubLogger = NOOP_LOG,
  ) {
    sub.onMessage((channel, message) => this.handleMessage(channel, message));
    sub.onReconnect(() => void this.handleReconnect());
  }

  /** تعداد شنونده‌های محلی یک کاربر. */
  localCount(userId: string): number {
    return this.channels.get(userChannel(userId))?.size ?? 0;
  }
  /** تعداد کانال‌های فعالِ این پروسه. */
  get activeChannels(): number {
    return this.channels.size;
  }

  /**
   * شنونده را ثبت و (در صورت نیاز) کانال Redis را subscribe می‌کند. وقتی resolve شد، تا جایی که Redis
   * سالم است هر اعلانِ بعدی به این شنونده می‌رسد. هرگز throw نمی‌کند: اگر Redis در دسترس نبود،
   * حالت «تنزل‌یافته» (فقط تحویل محلی + بازپخش از DB) فعال می‌شود.
   */
  async subscribe(userId: string, listener: HubListener): Promise<() => Promise<void>> {
    const ch = userChannel(userId);
    await this.withLock(ch, async () => {
      let set = this.channels.get(ch);
      const first = !set;
      if (!set) {
        set = new Set();
        this.channels.set(ch, set);
      }
      // شنونده «قبل از» تأیید اشتراک ثبت می‌شود تا پیامِ هم‌بسته‌ی ack گم نشود.
      set.add(listener);
      if (first) {
        try {
          await this.sub.subscribe(ch);
        } catch (err) {
          this.log.warn(`redis subscribe failed (degraded, local-only until reconnect): ${errMsg(err)}`);
        }
      }
    });
    return () => this.unsubscribe(ch, listener);
  }

  /** اعلان را به همه‌ی نمونه‌ها می‌رساند. هرگز throw نمی‌کند (اعلان‌ها non-critical و در DB ذخیره‌اند). */
  async publish(userId: string, event: NotificationEvent): Promise<void> {
    try {
      await this.pub.publish(userChannel(userId), JSON.stringify(event));
    } catch (err) {
      this.log.warn(`redis publish failed, delivering locally only: ${errMsg(err)}`);
      this.dispatch(userChannel(userId), event);
    }
  }

  // ─────────────────────────── داخلی ───────────────────────────

  private async unsubscribe(ch: string, listener: HubListener): Promise<void> {
    await this.withLock(ch, async () => {
      const set = this.channels.get(ch);
      if (!set) return;
      set.delete(listener);
      if (set.size > 0) return;
      this.channels.delete(ch);
      try {
        await this.sub.unsubscribe(ch);
      } catch (err) {
        this.log.warn(`redis unsubscribe failed: ${errMsg(err)}`);
      }
    });
  }

  /** subscribe/unsubscribe هر کانال سریالی اجرا می‌شود؛ وگرنه «آخرین اتصال برود، اولین بیاید» اشتراک را گم می‌کند. */
  private withLock<T>(ch: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(ch) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.catch(() => undefined);
    this.locks.set(ch, tail);
    void tail.then(() => {
      if (this.locks.get(ch) === tail) this.locks.delete(ch);
    });
    return run;
  }

  private handleMessage(channel: string, raw: string): void {
    if (!channel.startsWith(CHANNEL_PREFIX)) return;
    let event: NotificationEvent;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isEvent(parsed)) throw new Error("bad shape");
      event = parsed;
    } catch {
      this.log.warn(`dropping malformed pub/sub message on ${channel}`);
      return;
    }
    this.dispatch(channel, event);
  }

  private dispatch(channel: string, event: NotificationEvent): void {
    const set = this.channels.get(channel);
    if (!set) return;
    for (const l of [...set]) {
      try {
        l.onNotification(event);
      } catch (err) {
        this.log.error("listener failed", err);
      }
    }
  }

  /** اتصال subscriber برگشت: پیام‌های زمان قطعی گم شده‌اند. اشتراک‌ها را تضمین و همه را به جبران از DB دعوت کن. */
  private async handleReconnect(): Promise<void> {
    for (const ch of [...this.channels.keys()]) {
      try {
        await this.sub.subscribe(ch); // idempotent؛ کانال‌هایی که در حالت تنزل subscribe نشده بودند را هم می‌گیرد
      } catch (err) {
        this.log.warn(`resubscribe failed for ${ch}: ${errMsg(err)}`);
      }
    }
    for (const set of [...this.channels.values()]) {
      for (const l of [...set]) {
        try {
          l.onResync();
        } catch (err) {
          this.log.error("listener resync failed", err);
        }
      }
    }
  }
}

function isEvent(v: unknown): v is NotificationEvent {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.titleFa === "string" && typeof o.bodyFa === "string" && typeof o.createdAt === "string";
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
