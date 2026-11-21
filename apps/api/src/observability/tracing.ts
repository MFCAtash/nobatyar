import { SpanStatusCode, trace, type Attributes, type Span } from "@opentelemetry/api";
import { scrubString } from "@nobatyar/shared";

/**
 * Tracing (OpenTelemetry) روی مسیر رزرو و پرداخت.
 * حریم خصوصی: فقط کلیدهای «فهرست مجاز» به span می‌روند؛ مقدار رشته‌ای scrub و کوتاه می‌شود؛ پیام استثنا هرگز ثبت نمی‌شود
 * (ممکن است داده‌ی کاربر داشته باشد) — فقط نوع خطا. بدون SDK (OTEL_ENABLED≠true) همه‌چیز no-op است.
 */
const TRACER = "nobatyar";

/** شناسه‌های فنی (UUID) و برچسب‌های بی‌خطر. هیچ تلفن/نام/دلیل مراجعه/متن پیام. */
export const ALLOWED_ATTRIBUTES: ReadonlySet<string> = new Set([
  "appointment.id", "appointment.kind", "appointment.status", "appointment.action", "appointment.outcome",
  "payment.id", "payment.attempt_id", "payment.gateway", "payment.outcome", "payment.source", "payment.state",
  "refund.id", "refund.outcome", "refund.action",
  "outbox.claimed", "outbox.processed", "outbox.retried", "outbox.dead",
  "gateway.op", "gateway.provider", "idempotency.replayed",
]);

export function safeAttributes(attrs: Record<string, unknown> | undefined): Attributes {
  const out: Attributes = {};
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (!ALLOWED_ATTRIBUTES.has(k) || v === undefined || v === null) continue;
    if (typeof v === "string") out[k] = scrubString(v).slice(0, 128);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "bigint") out[k] = Number(v);
  }
  return out;
}

export function setSpanAttributes(span: Pick<Span, "setAttributes">, attrs: Record<string, unknown>): void {
  span.setAttributes(safeAttributes(attrs));
}

/** span ی فعال را اجرا می‌کند؛ خطا ⇒ فقط «نوع» ثبت و دوباره پرتاب می‌شود. */
export async function withSpan<T>(name: string, attrs: Record<string, unknown>, fn: (span: Span) => Promise<T>): Promise<T> {
  return trace.getTracer(TRACER).startActiveSpan(name, { attributes: safeAttributes(attrs) }, async (span) => {
    try {
      return await fn(span);
    } catch (e) {
      span.setAttribute("error.type", e instanceof Error ? e.name : "unknown");
      span.setStatus({ code: SpanStatusCode.ERROR }); // بدون message
      throw e;
    } finally {
      span.end();
    }
  });
}

// ───────────── پاک‌سازی span های خودکار (HTTP/Redis/Prisma) پیش از صدور ─────────────

type Attrs = Record<string, unknown>;
const DROP_PREFIXES = ["http.request.header.", "http.response.header.", "enduser.", "user_agent", "http.user_agent", "net.peer", "net.host", "client.address", "client.port", "network.peer"];
const QUERY_KEYS = new Set(["http.url", "url.full", "http.target", "url.path", "http.route_raw"]);
const SQL_KEYS = new Set(["db.statement", "db.query.text", "db.operation.parameter"]);

const stripQuery = (u: string): string => u.replace(/[?#].*$/, "");

/** نقاب‌گذاری «درجا» روی attributes ی یک span پایان‌یافته (در exporter ی scrubbing صدا زده می‌شود). */
export function scrubSpanAttributes(attrs: Attrs): void {
  for (const k of Object.keys(attrs)) {
    const v = attrs[k];
    if (DROP_PREFIXES.some((p) => k.startsWith(p))) { delete attrs[k]; continue; }
    if (k === "url.query" || k === "http.query") { delete attrs[k]; continue; }
    if (SQL_KEYS.has(k)) { attrs[k] = "[db]"; continue; }
    if (QUERY_KEYS.has(k) && typeof v === "string") { attrs[k] = scrubString(stripQuery(v)); continue; }
    if (typeof v === "string") attrs[k] = scrubString(v).slice(0, 256);
  }
}

/** رویدادهای span (exception) متن خطا/stack ندارند. */
export function scrubSpanEvents(events: { name: string; attributes?: Attrs }[]): void {
  for (const ev of events) {
    if (ev.attributes) { delete ev.attributes["exception.message"]; delete ev.attributes["exception.stacktrace"]; }
  }
}

export interface MutableSpan { name?: string; attributes: Attrs; events?: { name: string; attributes?: Attrs }[] }

/** نام span ی HTTP ممکن است شامل URL خام باشد ⇒ فقط «METHOD /route». */
export function scrubSpanName(name: string): string {
  const m = /^([A-Z]+)\s+(\S+)/.exec(name);
  return m ? `${m[1]} ${stripQuery(m[2])}` : name;
}

export function scrubSpan(s: MutableSpan): void {
  scrubSpanAttributes(s.attributes);
  if (s.events) scrubSpanEvents(s.events);
  if (typeof s.name === "string") s.name = scrubSpanName(s.name);
}
