/**
 * انتزاع کوچک روی Redis Pub/Sub (هم‌سبک kv-store.ts).
 *
 * - Publisher و Subscriber «دو اتصال جدا» هستند: اتصالِ در حالت subscribe در Redis فقط
 *   دستورهای (P)SUBSCRIBE/UNSUBSCRIBE/PING می‌پذیرد و PUBLISH روی آن ممکن نیست.
 * - پیاده‌سازی حافظه‌ای (`InMemoryPubSub`) برای تست بدون Redis و شبیه‌سازی «چند نمونه‌ی API».
 * - هیچ import ی از ioredis در این فایل نیست؛ کلاینت به‌صورت ساختاری تایپ شده است.
 */

export const PUBSUB_PUBLISHER = Symbol("PUBSUB_PUBLISHER");
export const PUBSUB_SUBSCRIBER = Symbol("PUBSUB_SUBSCRIBER");

export interface PubSubPublisher {
  /** تعداد subscriber هایی که پیام را گرفتند (در Redis: همه‌ی نمونه‌ها). */
  publish(channel: string, message: string): Promise<number>;
}

export interface PubSubSubscriber {
  /** وقتی resolve شد، Redis اشتراک را «تأیید» کرده است؛ از این لحظه پیامی گم نمی‌شود. */
  subscribe(channel: string): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
  onMessage(cb: (channel: string, message: string) => void): void;
  /** پس از «قطع و وصل مجدد» اتصال subscriber صدا زده می‌شود؛ پیام‌های زمان قطعی گم شده‌اند. */
  onReconnect(cb: () => void): void;
}

// ───────────────────────── Redis (ioredis) ─────────────────────────

export interface RedisPubLike {
  publish(channel: string, message: string): Promise<number>;
  quit(): Promise<unknown>;
}

export class RedisPublisher implements PubSubPublisher {
  constructor(private readonly r: RedisPubLike) {}

  publish(channel: string, message: string): Promise<number> {
    return this.r.publish(channel, message);
  }

  /** Nest هنگام shutdown صدا می‌زند. */
  async onModuleDestroy(): Promise<void> {
    await this.r.quit().catch(() => undefined);
  }
}

type AnyListener = (...args: never[]) => void;

export interface RedisSubLike {
  subscribe(...channels: string[]): Promise<unknown>;
  unsubscribe(...channels: string[]): Promise<unknown>;
  on(event: string, cb: AnyListener): unknown;
  quit(): Promise<unknown>;
}

export class RedisSubscriber implements PubSubSubscriber {
  private readonly messageCbs: Array<(channel: string, message: string) => void> = [];
  private readonly reconnectCbs: Array<() => void> = [];
  private dropped = false;

  constructor(
    private readonly r: RedisSubLike,
    onError: (err: Error) => void = () => undefined,
  ) {
    r.on("message", ((channel: string, message: string) => {
      for (const cb of this.messageCbs) cb(channel, message);
    }) as unknown as AnyListener);

    // ioredis: reconnecting → … → ready. فقط «ready ی بعد از قطعی» یعنی بازگشت.
    r.on("reconnecting", (() => {
      this.dropped = true;
    }) as unknown as AnyListener);
    r.on("ready", (() => {
      if (!this.dropped) return;
      this.dropped = false;
      for (const cb of this.reconnectCbs) cb();
    }) as unknown as AnyListener);
    r.on("error", ((e: Error) => onError(e)) as unknown as AnyListener);
  }

  async subscribe(channel: string): Promise<void> {
    await this.r.subscribe(channel);
  }
  async unsubscribe(channel: string): Promise<void> {
    await this.r.unsubscribe(channel);
  }
  onMessage(cb: (channel: string, message: string) => void): void {
    this.messageCbs.push(cb);
  }
  onReconnect(cb: () => void): void {
    this.reconnectCbs.push(cb);
  }

  async onModuleDestroy(): Promise<void> {
    await this.r.quit().catch(() => undefined);
  }
}

// ───────────────────────── حافظه‌ای (تست) ─────────────────────────

/** یک «Redis» درون‌پروسه‌ای. هر publisher()/subscriber() مثل یک اتصال جداست. */
export class InMemoryPubSub {
  readonly subscribers = new Set<InMemorySubscriber>();

  publisher(): InMemoryPublisher {
    return new InMemoryPublisher(this);
  }
  subscriber(): InMemorySubscriber {
    const s = new InMemorySubscriber();
    this.subscribers.add(s);
    return s;
  }
}

export class InMemoryPublisher implements PubSubPublisher {
  /** true ⇒ publish خطا می‌دهد (شبیه‌سازی قطع Redis). */
  fail = false;
  published: Array<{ channel: string; message: string }> = [];

  constructor(private readonly broker: InMemoryPubSub) {}

  async publish(channel: string, message: string): Promise<number> {
    if (this.fail) throw new Error("redis down");
    this.published.push({ channel, message });
    let n = 0;
    for (const s of this.broker.subscribers) {
      if (s.channels.has(channel)) {
        n++;
        // Redis پیام را «بعداً» و ناهم‌زمان تحویل می‌دهد، نه داخل خود PUBLISH.
        queueMicrotask(() => s.deliver(channel, message));
      }
    }
    return n;
  }
}

export class InMemorySubscriber implements PubSubSubscriber {
  readonly channels = new Set<string>();
  /** true ⇒ subscribe خطا می‌دهد. */
  failSubscribe = false;
  subscribeCalls: string[] = [];
  unsubscribeCalls: string[] = [];
  private messageCbs: Array<(c: string, m: string) => void> = [];
  private reconnectCbs: Array<() => void> = [];

  async subscribe(channel: string): Promise<void> {
    this.subscribeCalls.push(channel);
    if (this.failSubscribe) throw new Error("subscribe failed");
    this.channels.add(channel);
  }
  async unsubscribe(channel: string): Promise<void> {
    this.unsubscribeCalls.push(channel);
    this.channels.delete(channel);
  }
  onMessage(cb: (c: string, m: string) => void): void {
    this.messageCbs.push(cb);
  }
  onReconnect(cb: () => void): void {
    this.reconnectCbs.push(cb);
  }

  deliver(channel: string, message: string): void {
    for (const cb of this.messageCbs) cb(channel, message);
  }
  /** شبیه‌سازی بازگشت اتصال پس از قطعی. */
  simulateReconnect(): void {
    for (const cb of this.reconnectCbs) cb();
  }
}
