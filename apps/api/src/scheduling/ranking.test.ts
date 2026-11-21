import { describe, expect, it } from "vitest";
import { rankSlots, type BookingPreference } from "./ranking";
import type { Interval } from "./slots";

const now = new Date("2026-01-01T08:00:00Z"); // 11:30 تهران
const slot = (iso: string): Interval => ({
  start: new Date(iso), end: new Date(new Date(iso).getTime() + 20 * 60_000),
});

describe("رتبهبندی اسلاتها", () => {
  const slots = [
    slot("2026-01-03T06:00:00Z"), // 09:30 تهران، شنبه
    slot("2026-01-03T12:00:00Z"), // 15:30 تهران
    slot("2026-01-03T09:00:00Z"), // 12:30 تهران
  ];

  it("بدون ترجیح، ترتیب پایدار و امتیاز معتبر است", () => {
    const r = rankSlots(slots, { now });
    expect(r).toHaveLength(3);
    expect(r[0].startsAt).toBe(slots[0].start.toISOString());
    for (const x of r) {
      expect(x.score).toBeGreaterThanOrEqual(0);
      expect(x.score).toBeLessThanOrEqual(100);
      expect(x.reasonsFa.length).toBeGreaterThan(0);
    }
  });

  it("بازهٔ زمانی ترجیحی بالاترین امتیاز را میگیرد", () => {
    const pref: BookingPreference = { timeBands: [["15:00", "16:00"]], weekdays: [0] };
    const r = rankSlots(slots, { now, preference: pref });
    expect(r[0].startsAt).toBe(slots[1].start.toISOString());
    expect(r[0].reasonsFa).toContain("ساعت موردعلاقهٔ شما");
  });

  it("روز شلوغ پزشک امتیاز را کاهش میدهد", () => {
    const key = "2026-01-03";
    const quiet = rankSlots([slots[0]], { now })[0].score;
    const busy = rankSlots([slots[0]], { now, dayLoad: { [key]: 8 } })[0].score;
    expect(busy).toBeLessThan(quiet);
  });

  it("محدودیت limit رعایت میشود و هیچ PHIای در دلیلها نیست", () => {
    const r = rankSlots(slots, { now }, 2);
    expect(r).toHaveLength(2);
    for (const x of r) expect(x.reasonsFa.join(" ")).not.toMatch(/بیمار|دکتر|سلام|آزمایش/);
  });
});
