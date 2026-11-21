import type { Interval } from "./slots";

/** ترجیح کاربر — فاقد PHI و قابل ذخیره در localStorage/session فقط. */
export interface BookingPreference {
  weekdays?: number[];       // 0=شنبه ... 6=جمعه
  timeBands?: Array<[string, string]>; // "HH:mm" به وقت تهران
  maxLeadDays?: number;
}

export interface RankedSlot {
  startsAt: string;
  endsAt: string;
  score: number;             // 0..100
  reasonsFa: string[];       // برچسبهای ثابت و غیرحساس
}

export interface RankContext {
  now: Date;
  preference?: BookingPreference;
  /** تعداد نوبتهای همان روز پزشک (از appointment_busy) — بدون PHI. */
  dayLoad?: Record<string, number>;
}

const TEHRAN_OFFSET_MIN = 210;
const MIN = 60_000;

function minuteOfDayInTehran(d: Date): number {
  const shifted = new Date(d.getTime() + TEHRAN_OFFSET_MIN * MIN);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

function weekdayInTehran(d: Date): number {
  const shifted = new Date(d.getTime() + TEHRAN_OFFSET_MIN * MIN);
  return (shifted.getUTCDay() + 1) % 7;
}

function parseHHmm(s: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function dayKey(d: Date): string {
  const shifted = new Date(d.getTime() + TEHRAN_OFFSET_MIN * MIN);
  return shifted.toISOString().slice(0, 10);
}

/**
 * رتبهبندی توضیحپذیر اسلاتها. هیچ نام، دلیل مراجعه یا داده سلامتی در خروجی نیست.
 * ترتیب ورودی در صورت مساوی بودن امتیاز حفظ میشود (deterministic).
 */
export function rankSlots(slots: readonly Interval[], ctx: RankContext, limit = 5): RankedSlot[] {
  const bands = (ctx.preference?.timeBands ?? [])
    .map(([a, b]) => [parseHHmm(a), parseHHmm(b)] as const)
    .filter((x): x is readonly [number, number] => x[0] !== null && x[1] !== null);

  const scored = slots.map((s, index) => {
    let score = 50;
    const reasonsFa: string[] = [];

    const minute = minuteOfDayInTehran(s.start);
    const wd = weekdayInTehran(s.start);
    const leadDays = (s.start.getTime() - ctx.now.getTime()) / 86_400_000;

    if (ctx.preference?.weekdays?.includes(wd)) { score += 15; reasonsFa.push("روز موردعلاقهٔ شما"); }
    if (bands.some(([a, b]) => minute >= a && minute <= b)) { score += 20; reasonsFa.push("ساعت موردعلاقهٔ شما"); }
    if (leadDays >= 1 && leadDays <= 7) { score += 10; reasonsFa.push("زمان نزدیک و معقول"); }
    if (minute >= 8 * 60 && minute < 12 * 60) { score += 5; reasonsFa.push("ساعات کاری معمول"); }

    const load = ctx.dayLoad?.[dayKey(s.start)] ?? 0;
    if (load === 0) { score += 10; reasonsFa.push("روز خلوتتر پزشک"); }
    else if (load >= 6) { score -= 15; reasonsFa.push("روز شلوغ پزشک"); }

    score = Math.max(0, Math.min(100, score));
    if (reasonsFa.length === 0) reasonsFa.push("اسلات موجود");
    return { slot: s, score, reasonsFa, index };
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, limit).map((x) => ({
    startsAt: x.slot.start.toISOString(),
    endsAt: x.slot.end.toISOString(),
    score: x.score,
    reasonsFa: x.reasonsFa,
  }));
}
