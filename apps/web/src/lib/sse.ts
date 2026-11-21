/**
 * کلاینت SSE مبتنی بر fetch (به‌جای EventSource).
 *
 * چرا؟ EventSource نمی‌تواند هدر Authorization بفرستد؛ access token ی نوبتیار فقط در حافظه است و
 * (عمداً) در URL نمی‌آید. پس جریان را با fetch + ReadableStream می‌خوانیم و موارد زیر را خودمان انجام می‌دهیم:
 *  - Last-Event-ID: آخرین id ی دریافتی در هر reconnect فرستاده می‌شود (سرور اعلان‌های از دست‌رفته را از DB می‌دهد)
 *  - 401 ⇒ یک refresh ی single-flight (همان مکانیزم api.ts) و تلاش دوباره
 *  - watchdog: اگر ~۲٫۵ برابر فاصله‌ی heartbeat هیچ بایتی نیامد، اتصال نیمه‌مرده است ⇒ قطع و reconnect
 *  - backoff نمایی با jitter؛ و reconnect «فوری» وقتی سرور خودش اتصال را می‌بندد (event: reconnect)
 */

export interface SseMessage {
  event: string;
  data: string;
  id?: string;
}

/** پارسر افزایشی text/event-stream طبق استاندارد WHATWG (کامنت‌ها، CRLF، چند خط data، تکه‌های ناقص). */
export class SseParser {
  private buf = "";
  private data: string[] = [];
  private eventType = "";
  private lastId: string | undefined;
  /** مقدار آخرین فیلد retry (میلی‌ثانیه) */
  retryMs: number | undefined;

  push(chunk: string): SseMessage[] {
    this.buf += chunk;
    const out: SseMessage[] = [];
    for (;;) {
      const m = /\r\n|\n|\r/.exec(this.buf);
      if (!m) break;
      // «\r» در انتهای بافر: شاید «\n» بعدی در تکه‌ی بعد بیاید
      if (m[0] === "\r" && m.index + 1 === this.buf.length) break;
      const line = this.buf.slice(0, m.index);
      this.buf = this.buf.slice(m.index + m[0].length);
      const msg = this.line(line);
      if (msg) out.push(msg);
    }
    return out;
  }

  private line(line: string): SseMessage | null {
    if (line === "") {
      if (this.data.length === 0) {
        this.eventType = "";
        return null;
      }
      const msg: SseMessage = { event: this.eventType || "message", data: this.data.join("\n"), id: this.lastId };
      this.data = [];
      this.eventType = "";
      return msg;
    }
    if (line.startsWith(":")) return null; // کامنت/heartbeat
    const i = line.indexOf(":");
    const field = i === -1 ? line : line.slice(0, i);
    let value = i === -1 ? "" : line.slice(i + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    switch (field) {
      case "data": this.data.push(value); break;
      case "event": this.eventType = value; break;
      case "id": if (!value.includes("\0")) this.lastId = value; break;
      case "retry": if (/^\d+$/.test(value)) this.retryMs = Number(value); break;
    }
    return null;
  }
}

export type SseStatus = "connecting" | "open" | "retrying" | "stopped";
export type RefreshResult = "ok" | "denied" | "error";

export interface SseClientOptions {
  url: string;
  getToken: () => string | null;
  /** پس از 401 با توکن قدیمی صدا زده می‌شود. */
  refreshAuth: (staleToken: string | null) => Promise<RefreshResult>;
  /** `hadCursor`: آیا پیش از این رویداد، Last-Event-ID داشتیم؟ (برای تصمیم «لیست را دوباره بگیر») */
  onEvent: (m: SseMessage, info: { hadCursor: boolean }) => void;
  onStatus?: (s: SseStatus) => void;
  /** id ی شروع (اختیاری). */
  lastEventId?: string;
  fetchImpl?: typeof fetch;
  /** پیش‌فرض ۶۵ ثانیه ≈ ۲٫۵ × heartbeat ی ۲۵ ثانیه‌ای سرور */
  idleTimeoutMs?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  random?: () => number;
  /** حداکثر 401 ی پیاپی پس از refresh ی موفق، پیش از توقف (برای جلوگیری از حلقه). */
  max401?: number;
}

export interface SseConnection {
  close(): void;
  lastEventId(): string | undefined;
}

const DECODER_OPTS = { fatal: false } as const;

export function connectSse(o: SseClientOptions): SseConnection {
  const fetchImpl = o.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const idleMs = o.idleTimeoutMs ?? 65_000;
  const base = o.backoffBaseMs ?? 1_000;
  const cap = o.backoffMaxMs ?? 30_000;
  const rnd = o.random ?? Math.random;
  const max401 = o.max401 ?? 2;

  let stopped = false;
  let lastId = o.lastEventId;
  // بازپخش سرور عمداً کمی هم‌پوشانی دارد (ترتیب تحویل بین نمونه‌ها با createdAt یکی نیست) ⇒ تکراری‌ها اینجا حذف می‌شوند
  const seen = new Set<string>();
  let ctrl: AbortController | null = null;
  let wake: (() => void) | null = null;

  const status = (s: SseStatus) => o.onStatus?.(s);
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const t = setTimeout(resolve, ms);
      wake = () => {
        clearTimeout(t);
        resolve();
      };
    });

  async function run(): Promise<void> {
    let attempt = 0;
    let unauthorized = 0;

    while (!stopped) {
      status(attempt === 0 && unauthorized === 0 ? "connecting" : "retrying");
      ctrl = new AbortController();
      const signal = ctrl.signal;
      const token = o.getToken();
      const headers: Record<string, string> = { Accept: "text/event-stream", "Cache-Control": "no-cache" };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (lastId) headers["Last-Event-ID"] = lastId;

      let serverAskedReconnect = false;
      try {
        const res = await fetchImpl(o.url, { method: "GET", headers, credentials: "include", cache: "no-store", signal });

        if (res.status === 401) {
          // توکن منقضی: یک refresh؛ اگر رد شد دیگر تلاش نکن (auth-context کاربر را خارج می‌کند)
          const r = await o.refreshAuth(token);
          if (r === "denied") return stop();
          unauthorized++;
          if (r === "ok" && unauthorized <= max401) continue;
          if (r === "ok") return stop();
          await sleep(backoff(attempt++));
          continue;
        }
        unauthorized = 0;

        if (res.status === 429 || res.status >= 500) {
          const ra = Number(res.headers.get("Retry-After"));
          await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, cap) : backoff(attempt++));
          continue;
        }
        if (!res.ok || !res.body) return stop(); // 403/404 …: تلاش مجدد بی‌فایده است

        status("open");
        const parser = new SseParser();
        const decoder = new TextDecoder("utf-8", DECODER_OPTS);
        const reader = res.body.getReader();
        let idle: ReturnType<typeof setTimeout> | undefined;
        const arm = () => {
          clearTimeout(idle);
          idle = setTimeout(() => ctrl?.abort(), idleMs);
        };

        arm();
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            arm();
            for (const m of parser.push(decoder.decode(value, { stream: true }))) {
              const hadCursor = lastId !== undefined;
              if (m.id !== undefined) lastId = m.id;
              if (m.event === "notification" && m.id !== undefined) {
                if (seen.has(m.id)) continue;
                seen.add(m.id);
                if (seen.size > 1000) seen.delete(seen.values().next().value as string);
              }
              if (m.event === "ready") attempt = 0; // اتصال واقعاً برقرار شد
              if (m.event === "reconnect") serverAskedReconnect = true;
              try {
                o.onEvent(m, { hadCursor });
              } catch {
                /* خطای مصرف‌کننده اتصال را نمی‌کشد */
              }
            }
          }
        } finally {
          clearTimeout(idle);
          reader.cancel().catch(() => undefined);
        }
      } catch {
        if (stopped) return;
      }

      if (stopped) return;
      // سرور خودش بست (انقضای توکن/سقف عمر/خاموشی): بدون تأخیر؛ وگرنه backoff
      if (serverAskedReconnect) {
        attempt = 0;
        continue;
      }
      status("retrying");
      await sleep(backoff(attempt++));
    }
  }

  /** backoff نمایی با full-jitter: [0, min(cap, base·2^n)] — ولی حداقل base/2 تا حلقه‌ی داغ نشود. */
  function backoff(n: number): number {
    const ceil = Math.min(cap, base * 2 ** Math.min(n, 10));
    return Math.max(base / 2, Math.floor(rnd() * ceil));
  }

  function stop(): void {
    stopped = true;
    status("stopped");
  }

  void run();

  return {
    close() {
      if (stopped) return;
      stopped = true;
      ctrl?.abort();
      wake?.();
      status("stopped");
    },
    lastEventId: () => lastId,
  };
}
