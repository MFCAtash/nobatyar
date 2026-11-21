/**
 * رجیستری متریک Prometheus (بدون وابستگی). قواعد حریم‌خصوصی/کاردینالیتی:
 *  - برچسب مسیر فقط «الگوی route» است (/appointments/:id)، هرگز URL خام (شناسه/query/داده‌ی شخصی).
 *  - هیچ برچسبی از کاربر، IP یا بدنه ساخته نمی‌شود.
 */
type Labels = Record<string, string>;

const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
const key = (l: Labels) => Object.keys(l).sort().map((k) => `${k}="${esc(l[k]!)}"`).join(",");

export class Counter {
  private v = new Map<string, { l: Labels; n: number }>();
  constructor(readonly name: string, readonly help: string) {}
  inc(l: Labels = {}, by = 1): void {
    const k = key(l);
    const e = this.v.get(k);
    if (e) e.n += by; else this.v.set(k, { l, n: by });
  }
  render(): string[] {
    const out = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const [k, e] of this.v) out.push(`${this.name}${k ? `{${k}}` : ""} ${e.n}`);
    return out;
  }
}

export class Histogram {
  private v = new Map<string, { l: Labels; b: number[]; sum: number; count: number }>();
  constructor(readonly name: string, readonly help: string, readonly buckets: number[]) {}
  observe(l: Labels, value: number): void {
    const k = key(l);
    let e = this.v.get(k);
    if (!e) { e = { l, b: this.buckets.map(() => 0), sum: 0, count: 0 }; this.v.set(k, e); }
    this.buckets.forEach((ub, i) => { if (value <= ub) e!.b[i]!++; });
    e.sum += value; e.count++;
  }
  render(): string[] {
    const out = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const [, e] of this.v) {
      const base = key(e.l);
      this.buckets.forEach((ub, i) => out.push(`${this.name}_bucket{${base ? base + "," : ""}le="${ub}"} ${e.b[i]}`));
      out.push(`${this.name}_bucket{${base ? base + "," : ""}le="+Inf"} ${e.count}`);
      out.push(`${this.name}_sum${base ? `{${base}}` : ""} ${e.sum}`);
      out.push(`${this.name}_count${base ? `{${base}}` : ""} ${e.count}`);
    }
    return out;
  }
}

export interface GaugeSample { labels?: Labels; value: number }

/** خروجی متنی Prometheus از چند متریک + gauge های لحظه‌ای. */
export function renderMetrics(parts: { render(): string[] }[], gauges: { name: string; help: string; samples: GaugeSample[] }[] = []): string {
  const lines = parts.flatMap((p) => p.render());
  for (const g of gauges) {
    lines.push(`# HELP ${g.name} ${g.help}`, `# TYPE ${g.name} gauge`);
    for (const s of g.samples) lines.push(`${g.name}${s.labels && Object.keys(s.labels).length ? `{${key(s.labels)}}` : ""} ${s.value}`);
  }
  return lines.join("\n") + "\n";
}

/** الگوی route یا "unmatched" (۴۰۴/مسیرهای ناشناخته ⇒ کاردینالیتی ثابت). */
export function routeLabel(route: unknown): string {
  const p = (route as { path?: unknown } | undefined)?.path;
  return typeof p === "string" && p.length <= 120 ? p : "unmatched";
}

export const statusClass = (status: number): string => `${Math.floor(status / 100)}xx`;

export const httpRequests = new Counter("nobatyar_http_requests_total", "HTTP requests by route pattern, method and status class");
export const httpDuration = new Histogram("nobatyar_http_request_duration_seconds", "HTTP request duration (seconds)", [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]);
export const refundExec = new Counter("nobatyar_refund_outcomes_total", "Refund execution outcomes");
export const gatewayCalls = new Counter("nobatyar_gateway_calls_total", "Payment gateway calls by gateway, op and result (ok|error)");
export const gatewayDuration = new Histogram("nobatyar_gateway_duration_seconds", "Payment gateway call duration (seconds)", [0.1, 0.25, 0.5, 1, 2, 5, 10, 30]);
export const paymentOutcomes = new Counter("nobatyar_payment_outcomes_total", "Finalised payment attempts by outcome (paid|failed|expired|mismatch|duplicate)");
export const outboxProcessed = new Counter("nobatyar_outbox_processed_total", "Outbox events delivered");
/** A4: تعداد جلسات Scribe ی منقضیشده که متن موقتشان پاک شد (بدون هیچ برچسب شخصی). */
export const scribePurged = new Counter("nobatyar_scribe_purged_total", "Expired scribe transcripts purged");
export const outboxRetried = new Counter("nobatyar_outbox_retried_total", "Outbox events that failed and were rescheduled");
export const outboxDead = new Counter("nobatyar_outbox_dead_total", "Outbox events moved to DEAD (manual attention)");

export function recordHttp(method: string, route: unknown, status: number, seconds: number): void {
  const labels = { method, route: routeLabel(route), status: statusClass(status) };
  httpRequests.inc(labels);
  httpDuration.observe({ method, route: labels.route }, seconds);
}

/** شناسه‌ی درخواست: مقدار ورودی فقط اگر امن باشد؛ وگرنه تازه ساخته می‌شود (جلوگیری از log injection). */
export function requestId(incoming: unknown, gen: () => string): string {
  return typeof incoming === "string" && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : gen();
}

/** یک خط لاگ JSON دسترسی؛ بدون query، بدنه، IP، هدرها و هر داده‌ی کاربر. */
export function accessLogLine(e: { method: string; route: string; status: number; ms: number; rid: string }): string {
  return JSON.stringify({ t: new Date().toISOString(), level: e.status >= 500 ? "error" : "info", msg: "http", ...e });
}
