/** الگوی تکرار نوبت — subset امن RFC 5545 (بدون ReDoS و بدون تعداد نامحدود). */
export interface RecurringRule {
  freq: "WEEKLY" | "MONTHLY";
  interval: number; // 1..4
  count: number;    // 1..12
}

export function parseRRule(raw: string): RecurringRule {
  const parts = raw.split(";").map((p) => p.split("="));
  const get = (k: string): string | undefined => parts.find((p) => p[0] === k)?.[1];
  const freq = get("FREQ");
  if (freq !== "WEEKLY" && freq !== "MONTHLY") throw new Error("invalid FREQ");
  const interval = Number(get("INTERVAL") ?? "1");
  const count = Number(get("COUNT") ?? "1");
  if (!Number.isInteger(interval) || interval < 1 || interval > 4) throw new Error("INTERVAL out of range");
  if (!Number.isInteger(count) || count < 1 || count > 12) throw new Error("COUNT out of range");
  if (parts.some((p) => p.length !== 2)) throw new Error("malformed RRULE");
  const allowed = new Set(["FREQ", "INTERVAL", "COUNT"]);
  if (parts.some((p) => !allowed.has(p[0]))) throw new Error("unsupported RRULE field");
  return { freq, interval, count };
}

/** تاریخهای آیندهٔ occurrenceها (شامل anchor) — حداکثر ۱۲ مورد. */
export function nextOccurrences(anchor: Date, rule: RecurringRule): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < rule.count; i++) {
    const d = new Date(anchor.getTime());
    if (rule.freq === "WEEKLY") d.setUTCDate(d.getUTCDate() + i * rule.interval * 7);
    else d.setUTCMonth(d.getUTCMonth() + i * rule.interval);
    out.push(d);
  }
  return out;
}
