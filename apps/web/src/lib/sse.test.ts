import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { connectSse, SseParser } from "./sse";
import type { SseConnection, SseMessage } from "./sse";

describe("SseParser", () => {
  it("فریم ساده با id و event", () => {
    const p = new SseParser();
    expect(p.push("id: 7\nevent: notification\ndata: {\"a\":1}\n\n")).toEqual([{ event: "notification", data: '{"a":1}', id: "7" }]);
  });
  it("event پیش‌فرض message؛ چند خط data با \\n متصل می‌شود", () => {
    expect(new SseParser().push("data: a\ndata: b\n\n")).toEqual([{ event: "message", data: "a\nb", id: undefined }]);
  });
  it("کامنت/heartbeat رویداد نمی‌سازد", () => {
    expect(new SseParser().push(": hb\n\n: hb\n\n")).toEqual([]);
  });
  it("تکه‌تکه شدن در هر نقطه (حتی وسط کلمه)", () => {
    const raw = "id: 1\nevent: x\ndata: سلام\n\nid: 2\nevent: y\ndata: d2\n\n";
    const bytes = new TextEncoder().encode(raw);
    for (let cut = 1; cut < bytes.length; cut++) {
      const p = new SseParser(), dec = new TextDecoder();
      const out = [
        ...p.push(dec.decode(bytes.slice(0, cut), { stream: true })),
        ...p.push(dec.decode(bytes.slice(cut), { stream: true })),
      ];
      expect(out.map((m) => `${m.id}:${m.event}:${m.data}`)).toEqual(["1:x:سلام", "2:y:d2"]);
    }
  });
  it("CRLF و CR تنها؛ \\r آخر تکه منتظر \\n ی بعدی می‌ماند", () => {
    const p = new SseParser();
    expect(p.push("data: a\r")).toEqual([]);
    expect(p.push("\n\r\n")).toEqual([{ event: "message", data: "a", id: undefined }]);
    // CR ی تنها (جداکننده‌ی قدیمی مک): CR ی انتهایی تا دیدن بایت بعدی معلق می‌ماند، ولی چیزی گم نمی‌شود
    const q = new SseParser();
    expect(q.push("data: b\r\r")).toEqual([]);
    expect(q.push("data: c\n\n").map((m) => m.data)).toEqual(["b", "c"]);
  });
  it("id ماندگار است؛ id حاوی NUL نادیده گرفته می‌شود؛ retry", () => {
    const p = new SseParser();
    const out = p.push("id: 5\ndata: a\n\ndata: b\n\nid: x\0y\ndata: c\n\nretry: 4000\n\n");
    expect(out.map((m) => m.id)).toEqual(["5", "5", "5"]);
    expect(p.retryMs).toBe(4000);
  });
  it("فریم بدون data توسط خط خالی ارسال نمی‌شود", () => {
    expect(new SseParser().push("event: ready\n\n")).toEqual([]);
  });
});

// ───────────── کلاینت روی سرور HTTP واقعی ─────────────

type Handler = (req: IncomingMessage, res: ServerResponse, n: number) => void;
let server: Server | null = null;
let conn: SseConnection | null = null;
afterEach(async () => {
  conn?.close(); conn = null;
  if (server) { (server as Server & { closeAllConnections?: () => void }).closeAllConnections?.(); await new Promise((r) => server!.close(r)); server = null; }
});

async function serve(h: Handler) {
  let n = 0;
  const reqs: Array<{ auth?: string; lastEventId?: string }> = [];
  server = createServer((req, res) => {
    reqs.push({ auth: req.headers.authorization, lastEventId: req.headers["last-event-id"] as string | undefined });
    h(req, res, n++);
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(server!.address() as AddressInfo).port}/stream`, reqs };
}
const sseHead = (res: ServerResponse) => res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
const until = async (cond: () => boolean, ms = 3000) => {
  const t0 = Date.now();
  while (!cond()) { if (Date.now() - t0 > ms) throw new Error("timeout waiting for condition"); await new Promise((r) => setTimeout(r, 10)); }
};
const fast = { backoffBaseMs: 20, backoffMaxMs: 60, random: () => 0.5 };

describe("connectSse (fetch روی HTTP واقعی)", () => {
  it("Bearer می‌فرستد؛ رویدادها (event/id/data) را تحویل می‌دهد؛ heartbeat نادیده", async () => {
    const { url, reqs } = await serve((_q, res) => {
      sseHead(res);
      res.write("retry: 3000\n\nevent: ready\ndata: {}\n\n: hb\n\nid: n1\nevent: notification\ndata: {\"x\":1}\n\n");
    });
    const got: SseMessage[] = [];
    conn = connectSse({ url, getToken: () => "tok1", refreshAuth: async () => "denied", onEvent: (m) => void got.push(m), ...fast });
    await until(() => got.length === 2);
    expect(got.map((m) => m.event)).toEqual(["ready", "notification"]);
    expect(got[1].id).toBe("n1");
    expect(reqs[0].auth).toBe("Bearer tok1");
    expect(reqs[0].lastEventId).toBeUndefined();
  });

  it("پس از قطع، با Last-Event-ID ی آخرین اعلان reconnect می‌کند", async () => {
    const { url, reqs } = await serve((_q, res, n) => {
      sseHead(res);
      if (n === 0) { res.write("event: ready\ndata: {}\n\nid: n1\nevent: notification\ndata: {}\n\nid: n2\nevent: notification\ndata: {}\n\n"); setTimeout(() => res.destroy(), 30); }
      else res.write("event: ready\ndata: {}\n\nid: n3\nevent: notification\ndata: {}\n\n");
    });
    const got: Array<{ id?: string; hadCursor: boolean; event: string }> = [];
    conn = connectSse({ url, getToken: () => "t", refreshAuth: async () => "ok", onEvent: (m, i) => void got.push({ id: m.id, hadCursor: i.hadCursor, event: m.event }), ...fast });
    await until(() => got.some((g) => g.id === "n3"));
    expect(reqs).toHaveLength(2);
    expect(reqs[1].lastEventId).toBe("n2");
    // «ready» ی اتصال دوم با cursor آمده ⇒ کلاینت نیازی به REST ندارد
    const readies = got.filter((g) => g.event === "ready");
    expect(readies.map((r) => r.hadCursor)).toEqual([false, true]);
    expect(conn.lastEventId()).toBe("n3");
  });

  it("401 ⇒ یک refresh و تلاش دوباره با توکن تازه", async () => {
    let tok = "old";
    const { url, reqs } = await serve((req, res) => {
      if (req.headers.authorization !== "Bearer new") { res.writeHead(401, { "Content-Type": "application/json" }); res.end('{"error":"unauthorized"}'); return; }
      sseHead(res); res.write("event: ready\ndata: {}\n\n");
    });
    const got: string[] = [];
    const stale: Array<string | null> = [];
    conn = connectSse({
      url, getToken: () => tok,
      refreshAuth: async (s) => { stale.push(s); tok = "new"; return "ok"; },
      onEvent: (m) => void got.push(m.event), ...fast,
    });
    await until(() => got.includes("ready"));
    expect(stale).toEqual(["old"]);
    expect(reqs.map((r) => r.auth)).toEqual(["Bearer old", "Bearer new"]);
  });

  it("refresh رد شد (نشست باطل) ⇒ توقف؛ حلقه‌ی بی‌پایان نمی‌سازد", async () => {
    const { url, reqs } = await serve((_q, res) => { res.writeHead(401); res.end(); });
    const statuses: string[] = [];
    conn = connectSse({ url, getToken: () => "x", refreshAuth: async () => "denied", onEvent: () => undefined, onStatus: (s) => void statuses.push(s), ...fast });
    await until(() => statuses.includes("stopped"));
    await new Promise((r) => setTimeout(r, 150));
    expect(reqs).toHaveLength(1);
  });

  it("401 ی پیاپی با refresh ی «موفق»: پس از سقف متوقف می‌شود", async () => {
    const { url, reqs } = await serve((_q, res) => { res.writeHead(401); res.end(); });
    const statuses: string[] = [];
    conn = connectSse({ url, getToken: () => "x", refreshAuth: async () => "ok", onEvent: () => undefined, onStatus: (s) => void statuses.push(s), max401: 2, ...fast });
    await until(() => statuses.includes("stopped"));
    expect(reqs).toHaveLength(3);
  });

  it("event: reconnect ⇒ بدون backoff فوراً وصل می‌شود", async () => {
    const times: number[] = [];
    const { url } = await serve((_q, res, n) => {
      times.push(Date.now());
      sseHead(res);
      res.write("event: ready\ndata: {}\n\n");
      if (n === 0) { res.write("event: reconnect\ndata: {\"reason\":\"lifetime\"}\n\n"); res.end(); }
    });
    const got: string[] = [];
    conn = connectSse({ url, getToken: () => "t", refreshAuth: async () => "ok", onEvent: (m) => void got.push(m.event), backoffBaseMs: 5_000, backoffMaxMs: 5_000, random: () => 1 });
    await until(() => got.filter((e) => e === "ready").length === 2, 1500); // با backoff ی ۵ثانیه‌ای ممکن نبود
    expect(times[1] - times[0]).toBeLessThan(1000);
  });

  it("watchdog: بدون هیچ بایتی (heartbeat نیامد) ⇒ اتصال نیمه‌مرده قطع و دوباره وصل می‌شود", async () => {
    const { url, reqs } = await serve((_q, res, n) => {
      sseHead(res);
      res.write("event: ready\ndata: {}\n\n");
      // اتصال اول ساکت می‌ماند (شبیه proxy ی نیمه‌مرده)؛ دوم heartbeat می‌دهد
      if (n > 0) setInterval(() => res.write(": hb\n\n"), 20).unref();
    });
    const got: string[] = [];
    conn = connectSse({ url, getToken: () => "t", refreshAuth: async () => "ok", onEvent: (m) => void got.push(m.event), idleTimeoutMs: 120, ...fast });
    await until(() => got.filter((e) => e === "ready").length === 2, 2500);
    expect(reqs.length).toBeGreaterThan(1);
  });

  it("heartbeat ها watchdog را زنده نگه می‌دارند (بدون reconnect بی‌جهت)", async () => {
    const { url, reqs } = await serve((_q, res) => {
      sseHead(res);
      res.write("event: ready\ndata: {}\n\n");
      setInterval(() => res.write(": hb\n\n"), 30).unref();
    });
    conn = connectSse({ url, getToken: () => "t", refreshAuth: async () => "ok", onEvent: () => undefined, idleTimeoutMs: 150, ...fast });
    await new Promise((r) => setTimeout(r, 600));
    expect(reqs).toHaveLength(1);
  });

  it("429/5xx ⇒ backoff و تلاش دوباره؛ 403 ⇒ توقف", async () => {
    const a = await serve((_q, res, n) => {
      if (n < 2) { res.writeHead(n === 0 ? 429 : 503); res.end(); return; }
      sseHead(res); res.write("event: ready\ndata: {}\n\n");
    });
    const got: string[] = [];
    conn = connectSse({ url: a.url, getToken: () => "t", refreshAuth: async () => "ok", onEvent: (m) => void got.push(m.event), ...fast });
    await until(() => got.includes("ready"));
    expect(a.reqs).toHaveLength(3);
    conn.close();
    (server as Server & { closeAllConnections?: () => void }).closeAllConnections?.();
    await new Promise((r) => server!.close(r)); server = null;

    const b = await serve((_q, res) => { res.writeHead(403); res.end(); });
    const st: string[] = [];
    conn = connectSse({ url: b.url, getToken: () => "t", refreshAuth: async () => "ok", onEvent: () => undefined, onStatus: (s) => void st.push(s), ...fast });
    await until(() => st.includes("stopped"));
    expect(b.reqs).toHaveLength(1);
  });

  it("close(): اتصال را می‌بندد و دیگر reconnect نمی‌کند", async () => {
    const { url, reqs } = await serve((_q, res) => { sseHead(res); res.write("event: ready\ndata: {}\n\n"); });
    const got: string[] = [];
    conn = connectSse({ url, getToken: () => "t", refreshAuth: async () => "ok", onEvent: (m) => void got.push(m.event), ...fast });
    await until(() => got.includes("ready"));
    conn.close();
    await new Promise((r) => setTimeout(r, 200));
    expect(reqs).toHaveLength(1);
  });
});

describe("connectSse — حذف تکراری‌های هم‌پوشانیِ بازپخش", () => {
  it("اعلانِ هم‌id ی تکراری فقط یک‌بار به onEvent می‌رسد؛ ولی resync/reconnect هرگز حذف نمی‌شود", async () => {
    const { url } = await serve((_q, res) => {
      sseHead(res);
      res.write("event: ready\ndata: {}\n\nid: n1\nevent: notification\ndata: {}\n\nid: n1\nevent: notification\ndata: {}\n\nevent: resync\ndata: {\"reason\":\"gap\"}\n\n");
    });
    const got: string[] = [];
    conn = connectSse({ url, getToken: () => "t", refreshAuth: async () => "ok", onEvent: (m) => void got.push(m.event), ...fast });
    await until(() => got.includes("resync"));
    expect(got).toEqual(["ready", "notification", "resync"]);
  });
});
