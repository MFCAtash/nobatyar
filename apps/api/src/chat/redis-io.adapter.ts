import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { INestApplicationContext } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import Redis from "ioredis";
import type { ServerOptions } from "socket.io";

/**
 * socket.io روی Redis (@socket.io/redis-adapter): `io.to(room).emit(...)` و `socket.to(room)` در هر نمونه‌ی API،
 * به سوکت‌های متصل به «همه‌ی نمونه‌ها» می‌رسد. انتقال فقط websocket است ⇒ به sticky session نیاز نیست.
 *
 * دو اتصال جدا (pub و sub) ساخته می‌شود؛ اتصال sub در حالت subscribe است و دستور دیگری نمی‌پذیرد.
 * فقط برای رویدادهای «لحظه‌ای» چت (new_message، typing، messages_read) است؛ تاریخچه‌ی پیام‌ها در DB است.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly log = new Logger(RedisIoAdapter.name);
  private pub?: Redis;
  private sub?: Redis;
  private adapterCtor?: ReturnType<typeof createAdapter>;

  constructor(app: INestApplicationContext, private readonly redisUrl: string) {
    super(app);
  }

  /** پیش از app.listen صدا بزنید؛ تا اتصال هر دو کلاینت آماده نشود برنمی‌گردد. */
  async connect(): Promise<void> {
    const opts = { maxRetriesPerRequest: null, enableReadyCheck: true } as const;
    this.pub = new Redis(this.redisUrl, opts);
    this.sub = this.pub.duplicate();
    for (const [name, c] of [["pub", this.pub], ["sub", this.sub]] as const) {
      c.on("error", (e: Error) => this.log.warn(`socket.io redis ${name}: ${e.message}`));
    }
    await Promise.all([whenReady(this.pub), whenReady(this.sub)]);
    this.adapterCtor = createAdapter(this.pub, this.sub);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (!this.adapterCtor) throw new Error("RedisIoAdapter.connect() must be awaited before listen()");
    server.adapter(this.adapterCtor);
    return server;
  }

  /** Nest هنگام app.close() صدا می‌زند: ابتدا dispose ی پایه (اگر در این نسخه‌ی Nest هست)، سپس بستن اتصال‌های Redis. */
  async dispose(): Promise<void> {
    const base = (IoAdapter.prototype as unknown as { dispose?: () => unknown }).dispose;
    await base?.call(this);
    await Promise.all([this.pub?.quit(), this.sub?.quit()].map((p) => p?.catch(() => undefined)));
  }
}

function whenReady(c: Redis): Promise<void> {
  if (c.status === "ready") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("redis (socket.io adapter) connect timeout")), 10_000);
    c.once("ready", () => {
      clearTimeout(t);
      resolve();
    });
  });
}
