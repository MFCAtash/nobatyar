/**
 * M9 — تایم‌لاین سلامت (منطق خالص).
 *
 * مقادیر بالینی با واحد صریح نرمال می‌شوند تا نمودار و مقایسه معتبر باشد.
 */

export const TIMELINE_KINDS = ["WEIGHT", "BP", "GLUCOSE", "LAB"] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];

export interface Measurement {
  kind: TimelineKind;
  primary: number;
  secondary?: number;
  unit: string;
}

export class MeasurementError extends Error {}

const limits: Record<TimelineKind, { min: number; max: number; unit: string }> = {
  WEIGHT: { min: 2, max: 400, unit: "kg" },
  BP: { min: 40, max: 300, unit: "mmHg" },
  GLUCOSE: { min: 20, max: 900, unit: "mg/dL" },
  LAB: { min: -1_000_000, max: 1_000_000, unit: "unit" },
};

const num = (s: string): number => {
  const v = Number(
    s
      .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))),
  );
  if (!Number.isFinite(v)) throw new MeasurementError("مقدار عددی نیست");
  return v;
};

/**
 * ورودی کاربر: "72.5" برای وزن، "120/80" برای فشار، "110" برای قند،
 * و برای LAB مقدار + واحد جدا ارسال می‌شود.
 */
export function parseMeasurement(kind: TimelineKind, raw: string, unit?: string): Measurement {
  const text = String(raw ?? "").trim();
  if (!text) throw new MeasurementError("مقدار خالی است");
  const lim = limits[kind];

  if (kind === "BP") {
    const m = /^(\d{2,3})\s*\/\s*(\d{2,3})$/.exec(text);
    if (!m) throw new MeasurementError("فشار باید به شکل سیستول/دیاستول باشد");
    const primary = num(m[1]);
    const secondary = num(m[2]);
    if (primary < lim.min || primary > lim.max) throw new MeasurementError("سیستول خارج از بازه");
    if (secondary < 20 || secondary > 200) throw new MeasurementError("دیاستول خارج از بازه");
    if (secondary >= primary) throw new MeasurementError("دیاستول باید کمتر از سیستول باشد");
    return { kind, primary, secondary, unit: lim.unit };
  }

  const primary = num(text);
  if (primary < lim.min || primary > lim.max) throw new MeasurementError("مقدار خارج از بازهٔ مجاز");
  return {
    kind,
    primary,
    unit: kind === "LAB" ? (unit ?? lim.unit).slice(0, 16) : lim.unit,
  };
}

export interface TimelinePoint {
  id: string;
  kind: TimelineKind;
  at: string;
  primary: number;
  secondary?: number;
  unit: string;
}

export interface Trend {
  count: number;
  latest: number | null;
  previous: number | null;
  delta: number | null;
  direction: "up" | "down" | "flat" | "unknown";
}

/** روند ساده بر پایهٔ دو نقطهٔ آخر؛ جهت‌گیری تشخیصی ندارد. */
export function trendOf(points: TimelinePoint[]): Trend {
  const sorted = [...points].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const n = sorted.length;
  if (n === 0) return { count: 0, latest: null, previous: null, delta: null, direction: "unknown" };
  const latest = sorted[n - 1].primary;
  if (n === 1) return { count: 1, latest, previous: null, delta: null, direction: "unknown" };
  const previous = sorted[n - 2].primary;
  const delta = Math.round((latest - previous) * 100) / 100;
  const direction = delta === 0 ? "flat" : delta > 0 ? "up" : "down";
  return { count: n, latest, previous, delta, direction };
}

/** گروه‌بندی نقاط بر اساس نوع برای نمودار. */
export function groupByKind(points: TimelinePoint[]): Record<TimelineKind, TimelinePoint[]> {
  const out: Record<TimelineKind, TimelinePoint[]> = { WEIGHT: [], BP: [], GLUCOSE: [], LAB: [] };
  for (const p of points) out[p.kind].push(p);
  for (const k of TIMELINE_KINDS) out[k].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return out;
}

/** بازهٔ زمانی معتبر: from <= to و طول حداکثر ۵ سال. */
export function validateRange(from: Date, to: Date): void {
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new MeasurementError("بازهٔ زمانی نامعتبر");
  if (from > to) throw new MeasurementError("from باید قبل از to باشد");
  if (to.getTime() - from.getTime() > 5 * 365 * 24 * 3_600_000) throw new MeasurementError("بازه بیش از حد بزرگ");
}
