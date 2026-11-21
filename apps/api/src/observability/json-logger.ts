import type { LoggerService } from "@nestjs/common";
import { trace } from "@opentelemetry/api";
import { scrubDeep, scrubString } from "@nobatyar/shared";

/**
 * لاگ ساخت‌یافته (یک خط JSON برای هر رویداد) برای Loki/Grafana.
 *  - «هر» متن و فیلد پیش از نوشتن با scrub ی مشترک (همان Sentry) پاک می‌شود: شماره‌ی موبایل، توکن‌ها، کلیدهای حساس (دلیل مراجعه، تشخیص، …).
 *  - trace_id / span_id ی span ی فعال اضافه می‌شود ⇒ از لاگ به trace (و برعکس) در Grafana می‌روید.
 *  - خروجی همیشه «یک خط» است (JSON.stringify)؛ تزریق خط جعلی در لاگ ممکن نیست. سقف طول: ۱۶KB.
 *  - لاگ دسترسی ی JSON (accessLogLine) پارس و فیلدهایش ادغام می‌شود (نه JSON در JSON).
 */
export type Level = "debug" | "info" | "warn" | "error";
export const LEVEL_RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export const MAX_LINE_BYTES = 16 * 1024;
const MAX_STACK = 4000;

export interface LineContext { service: string; now: Date; traceId?: string; spanId?: string }

type Fields = Record<string, unknown>;
const isPlainObject = (v: unknown): v is Fields => typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Error);

function tryParseObject(s: string): Fields | null {
  const t = s.trim();
  if (!t.startsWith("{") || !t.endsWith("}")) return null;
  try { const v: unknown = JSON.parse(t); return isPlainObject(v) ? v : null; } catch { return null; }
}

/**
 * شیء ⇒ { msg, fields }. «message/msg» پیش از scrubDeep جدا و با scrubString پاک می‌شود
 * (کلید `message` در scrubDeep «حساس» است و متن لاگ را به [Filtered] می‌کرد)؛ بقیه‌ی فیلدها با scrubDeep.
 */
function splitObject(o: Fields): { msg: string; fields: Fields } {
  const { message, msg, level: _level, t: _t, ...rest } = o;
  const text = typeof message === "string" ? message : typeof msg === "string" ? msg : "";
  return { msg: scrubString(text), fields: scrubDeep(rest as never) as Fields };
}

/** تبدیل پیام Nest (string | object | Error) ⇒ { msg, fields }. */
export function normalizeMessage(message: unknown): { msg: string; fields: Fields } {
  if (message instanceof Error) {
    return { msg: scrubString(`${message.name}: ${message.message}`), fields: message.stack ? { stack: scrubString(message.stack).slice(0, MAX_STACK) } : {} };
  }
  if (typeof message === "string") {
    const obj = tryParseObject(message);
    if (obj) return splitObject(obj);
    return { msg: scrubString(message), fields: {} };
  }
  if (isPlainObject(message)) return splitObject(message);
  return { msg: scrubString(String(message)), fields: {} };
}

/** فیلدهای رزروشده‌ی خروجی؛ فیلد کاربر با همین نام‌ها نمی‌تواند آن‌ها را بازنویسی کند. */
const RESERVED = new Set(["ts", "level", "ctx", "msg", "service", "trace_id", "span_id"]);

export function formatLogLine(level: Level, message: unknown, ctx: string | undefined, c: LineContext, extra?: unknown): string {
  const { msg, fields } = normalizeMessage(message);
  const safeFields: Fields = {};
  for (const [k, v] of Object.entries(fields)) safeFields[RESERVED.has(k) ? `f_${k}` : k] = v;
  const rec: Fields = {
    ts: c.now.toISOString(), level, service: c.service, ...(ctx ? { ctx } : {}), msg: msg.slice(0, 4000),
    ...(c.traceId ? { trace_id: c.traceId, span_id: c.spanId } : {}),
    ...(typeof extra === "string" && extra ? { stack: scrubString(extra).slice(0, MAX_STACK) } : {}),
    ...safeFields,
  };
  let line = JSON.stringify(rec);
  if (Buffer.byteLength(line) > MAX_LINE_BYTES) line = JSON.stringify({ ts: rec.ts, level, service: c.service, ...(ctx ? { ctx } : {}), msg: String(rec.msg).slice(0, 1000), truncated: true, ...(c.traceId ? { trace_id: c.traceId, span_id: c.spanId } : {}) });
  return line;
}

/** Nest LoggerService: JSON روی stdout (stderr برای error) — Docker/Alloy آن را به Loki می‌برد. */
export class JsonLogger implements LoggerService {
  constructor(
    private readonly service: string,
    private readonly minLevel: Level = "info",
    private readonly out: { stdout(s: string): void; stderr(s: string): void } = { stdout: (s) => process.stdout.write(s), stderr: (s) => process.stderr.write(s) },
    private readonly now: () => Date = () => new Date(),
  ) {}

  private write(level: Level, message: unknown, params: unknown[]): void {
    if (LEVEL_RANK[level] < LEVEL_RANK[this.minLevel]) return;
    // امضای Nest: (message, ...optional، آخرین = context)؛ برای error: (message, stack?, context?)
    const last = params.length ? params[params.length - 1] : undefined;
    const ctx = typeof last === "string" ? last : undefined;
    const stack = level === "error" && params.length >= 2 && typeof params[0] === "string" ? params[0] : undefined;
    const span = trace.getActiveSpan()?.spanContext();
    const line = formatLogLine(level, message, ctx, { service: this.service, now: this.now(), traceId: span?.traceId, spanId: span?.spanId }, stack);
    (level === "error" ? this.out.stderr : this.out.stdout)(`${line}\n`);
  }

  log(message: unknown, ...p: unknown[]) { this.write("info", message, p); }
  error(message: unknown, ...p: unknown[]) { this.write("error", message, p); }
  warn(message: unknown, ...p: unknown[]) { this.write("warn", message, p); }
  debug(message: unknown, ...p: unknown[]) { this.write("debug", message, p); }
  verbose(message: unknown, ...p: unknown[]) { this.write("debug", message, p); }
}

export function parseLevel(v: string | undefined): Level {
  return v === "debug" || v === "info" || v === "warn" || v === "error" ? v : "info";
}
