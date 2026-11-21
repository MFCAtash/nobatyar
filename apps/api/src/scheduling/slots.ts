/**
 * تولید اسلات از قواعد هفتگی پزشک.
 *  - همه‌ی زمان‌های ورودی/خروجی UTC (Date)؛ قواعد هفتگی به وقت تهران.
 *  - ایران از ۱۴۰۱ ساعت تابستانی ندارد ⇒ آفست ثابت +۰۳:۳۰ (۲۱۰ دقیقه). اگر قانون تغییر کرد، فقط این ثابت/تابع عوض شود.
 *  - هفته‌ی ایرانی: 0=شنبه، 1=یکشنبه، … 6=جمعه.
 */
export const TEHRAN_OFFSET_MIN = 210;
const MIN = 60_000;

export interface Interval {
  start: Date;
  end: Date;
}
export interface WeeklyRule {
  weekday: number;
  startTime: string; // "HH:mm" وقت تهران
  endTime: string;
}

export function parseHHmm(s: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  if (!m) throw new Error(`invalid time '${s}', expected HH:mm`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export interface TehranDate {
  y: number;
  m: number; // 1-12
  d: number;
  weekday: number; // 0=شنبه
}

export function tehranDateOf(instant: Date): TehranDate {
  const shifted = new Date(instant.getTime() + TEHRAN_OFFSET_MIN * MIN);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
    weekday: (shifted.getUTCDay() + 1) % 7,
  };
}

export function parseDateStr(s: string): TehranDate {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`invalid date '${s}', expected YYYY-MM-DD`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    throw new Error(`invalid calendar date '${s}'`);
  }
  return { y, m: mo, d, weekday: (probe.getUTCDay() + 1) % 7 };
}

export function formatDateStr(t: Pick<TehranDate, "y" | "m" | "d">): string {
  return `${String(t.y).padStart(4, "0")}-${String(t.m).padStart(2, "0")}-${String(t.d).padStart(2, "0")}`;
}

/** تاریخ محلی تهران + دقیقه‌ی روز ⇒ لحظه‌ی UTC */
export function tehranLocalToUtc(t: Pick<TehranDate, "y" | "m" | "d">, minuteOfDay: number): Date {
  return new Date(Date.UTC(t.y, t.m - 1, t.d, 0, minuteOfDay) - TEHRAN_OFFSET_MIN * MIN);
}

export const overlaps = (a: Interval, b: Interval): boolean => a.start < b.end && b.start < a.end;

export interface SlotOptions {
  rules: WeeklyRule[];
  slotMinutes: number;
  fromDate: string; // YYYY-MM-DD تهران (شامل)
  toDate: string;   // شامل
  unavailable: Interval[]; // نوبت‌های اشغال + مرخصی‌ها
  now: Date;
  minLeadMinutes: number;
  maxAdvanceDays: number;
}

export function generateSlots(o: SlotOptions): Interval[] {
  const from = parseDateStr(o.fromDate);
  const to = parseDateStr(o.toDate);
  const earliest = o.now.getTime() + o.minLeadMinutes * MIN;
  const latest = o.now.getTime() + o.maxAdvanceDays * 86_400_000;
  const out = new Map<number, Interval>();

  const cursor = new Date(Date.UTC(from.y, from.m - 1, from.d));
  const last = Date.UTC(to.y, to.m - 1, to.d);
  for (; cursor.getTime() <= last; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const day = { y: cursor.getUTCFullYear(), m: cursor.getUTCMonth() + 1, d: cursor.getUTCDate() };
    const weekday = (cursor.getUTCDay() + 1) % 7;
    for (const r of o.rules) {
      if (r.weekday !== weekday) continue;
      const end = parseHHmm(r.endTime);
      for (let t = parseHHmm(r.startTime); t + o.slotMinutes <= end; t += o.slotMinutes) {
        const start = tehranLocalToUtc(day, t);
        const slot = { start, end: new Date(start.getTime() + o.slotMinutes * MIN) };
        if (start.getTime() < earliest || start.getTime() > latest) continue;
        if (o.unavailable.some((u) => overlaps(slot, u))) continue;
        out.set(start.getTime(), slot);
      }
    }
  }
  return [...out.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}

export type AvailabilityIssue = { index?: number; message: string };

/** اعتبارسنجی قواعد هفتگی که پزشک ثبت می‌کند. */
export function validateAvailability(rules: WeeklyRule[], slotMinutes: number): AvailabilityIssue[] {
  const issues: AvailabilityIssue[] = [];
  if (rules.length > 70) issues.push({ message: "too many rules (max 70)" });
  const byDay = new Map<number, { s: number; e: number; i: number }[]>();

  rules.forEach((r, i) => {
    if (!Number.isInteger(r.weekday) || r.weekday < 0 || r.weekday > 6) return void issues.push({ index: i, message: "weekday must be 0..6 (0=Saturday)" });
    let s: number, e: number;
    try {
      s = parseHHmm(r.startTime);
      e = parseHHmm(r.endTime);
    } catch (err) {
      return void issues.push({ index: i, message: (err as Error).message });
    }
    if (e <= s) return void issues.push({ index: i, message: "endTime must be after startTime" });
    if (e - s < slotMinutes) return void issues.push({ index: i, message: `window shorter than slot (${slotMinutes} min)` });
    (byDay.get(r.weekday) ?? byDay.set(r.weekday, []).get(r.weekday)!).push({ s, e, i });
  });

  for (const list of byDay.values()) {
    list.sort((a, b) => a.s - b.s);
    for (let k = 1; k < list.length; k++) {
      if (list[k].s < list[k - 1].e) issues.push({ index: list[k].i, message: "overlaps another window on the same weekday" });
    }
  }
  return issues;
}
