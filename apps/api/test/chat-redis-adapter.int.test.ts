/**
 * تست یکپارچه‌ی RedisIoAdapter: دو «نمونه‌ی API» (دو سرور socket.io)؛ emit در نمونه‌ی B به سوکتِ متصل به A می‌رسد.
 * نیازمند TEST_REDIS_URL؛ بدون آن skip می‌شود.
 * ⚠️ در محیط ساخت اجرا نشده (نصب پکیج ممکن نبود) — پیش از اتکا یک‌بار اجرا شود.
 */
import { createServer } from "node:http";
import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as connect } from "socket.io-client";
import type { Socket as ClientSocket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RedisIoAdapter } from "../src/chat/redis-io.adapter";

const URL_ = process.env.TEST_REDIS_URL;
const d = URL_ ? describe : describe.skip;

d("RedisIoAdapter (دو نمونه)", () => {
  const http: HttpServer[] = [];
  const adapters: RedisIoAdapter[] = [];
  const servers: Array<ReturnType<RedisIoAdapter["createIOServer"]>> = [];
  const port = (i: number) => (http[i].address() as AddressInfo).port;
  let client: ClientSocket;

  beforeAll(async () => {
    for (let i = 0; i < 2; i++) {
      const h = createServer();
      http.push(h);
      const a = new RedisIoAdapter(h as never, URL_!);
      await a.connect();
      adapters.push(a);
      servers.push(a.createIOServer(0, {} as never));
      await new Promise<void>((r) => h.listen(0, "127.0.0.1", r));
    }
  });
  afterAll(async () => {
    client?.close();
    for (const s of servers) await new Promise((r) => s.close(r));
    await Promise.all(adapters.map((a) => a.dispose()));
  });

  it("رویداد اتاق از نمونه‌ی B به کلاینتِ متصل به نمونه‌ی A می‌رسد", async () => {
    servers[0].of("/chat").on("connection", (s: { join(r: string): void }) => s.join("conv:1"));
    client = connect(`http://127.0.0.1:${port(0)}/chat`, { transports: ["websocket"] });
    await new Promise<void>((r) => client.on("connect", () => r()));
    await new Promise((r) => setTimeout(r, 100));
    const got = new Promise<unknown>((r) => client.on("new_message", r));
    servers[1].of("/chat").to("conv:1").emit("new_message", { hello: "world" });
    expect(await got).toEqual({ hello: "world" });
  });

  it("fetchSockets در کل خوشه (پایه‌ی isOnline)", async () => {
    const socks = await servers[1].of("/chat").in("conv:1").fetchSockets();
    expect(socks.length).toBe(1);
  });
});
