import { describe, expect, it } from "vitest";
import { generateSlots, parseDateStr, tehranDateOf, tehranLocalToUtc, validateAvailability, WeeklyRule } from "./slots";

const now = new Date("2026-10-13T00:00:00Z");
const rules: WeeklyRule[] = [
  { weekday: 3, startTime: "09:00", endTime: "10:00" }, // 2026-10-13 سه‌شنبه ⇒ index 3 (شنبه=۰)
  { weekday: 3, startTime: "16:00", endTime: "17:00" },
];
const base = { rules, slotMinutes: 20, fromDate: "2026-10-13", toDate: "2026-10-13", unavailable: [], now, minLeadMinutes: 30, maxAdvanceDays: 60 };

describe("Tehran date math", () => {
  it("maps weekday with Saturday = 0", () => {
    expect(parseDateStr("2026-10-13").weekday).toBe(3);
    expect(parseDateStr("2026-10-10").weekday).toBe(0); // شنبه
    expect(parseDateStr("2026-10-16").weekday).toBe(6); // جمعه
  });
  it("converts Tehran local time to UTC (+03:30)", () => {
    expect(tehranLocalToUtc(parseDateStr("2026-10-13"), 9 * 60).toISOString()).toBe("2026-10-13T05:30:00.000Z");
  });
  it("rolls the date over at 20:30 UTC", () => {
    const t = tehranDateOf(new Date("2026-10-13T21:00:00Z"));
    expect([t.y, t.m, t.d, t.weekday]).toEqual([2026, 10, 14, 4]);
  });
  it("rejects malformed and impossible dates", () => {
    expect(() => parseDateStr("2026-02-30")).toThrow();
    expect(() => parseDateStr("26-1-1")).toThrow();
  });
});

describe("generateSlots", () => {
  it("builds slots inside each window", () => {
    const s = generateSlots(base);
    expect(s).toHaveLength(6);
    expect(s[0].start.toISOString()).toBe("2026-10-13T05:30:00.000Z");
    expect(s[0].end.toISOString()).toBe("2026-10-13T05:50:00.000Z");
  });
  it("removes slots overlapping busy intervals or time-off", () => {
    const s = generateSlots({ ...base, unavailable: [{ start: new Date("2026-10-13T05:45:00Z"), end: new Date("2026-10-13T06:05:00Z") }] });
    expect(s).toHaveLength(4);
  });
  it("enforces minimum lead time and maximum advance", () => {
    expect(generateSlots({ ...base, now: new Date("2026-10-13T05:20:00Z") })[0].start.toISOString()).toBe("2026-10-13T05:50:00.000Z");
    expect(generateSlots({ ...base, maxAdvanceDays: 1, fromDate: "2026-10-20", toDate: "2026-10-20" })).toHaveLength(0);
  });
  it("only uses rules for matching weekdays across a range", () => {
    expect(generateSlots({ ...base, fromDate: "2026-10-10", toDate: "2026-10-16" })).toHaveLength(6);
  });
  it("drops a trailing partial slot and dedupes identical rules", () => {
    expect(generateSlots({ ...base, rules: [{ weekday: 3, startTime: "09:00", endTime: "09:50" }] })).toHaveLength(2);
    expect(generateSlots({ ...base, rules: [rules[0], rules[0]] })).toHaveLength(3);
  });
});

describe("validateAvailability", () => {
  it("accepts valid and adjacent windows", () => {
    expect(validateAvailability(rules, 20)).toEqual([]);
    expect(validateAvailability([{ weekday: 1, startTime: "09:00", endTime: "10:00" }, { weekday: 1, startTime: "10:00", endTime: "11:00" }], 20)).toEqual([]);
  });
  it.each([
    [{ weekday: 7, startTime: "09:00", endTime: "10:00" }],
    [{ weekday: 1, startTime: "10:00", endTime: "09:00" }],
    [{ weekday: 1, startTime: "09:00", endTime: "09:10" }],
    [{ weekday: 1, startTime: "9:00", endTime: "10:00" }],
  ])("rejects %j", (r) => expect(validateAvailability([r], 20).length).toBeGreaterThan(0));
  it("rejects overlapping windows on one weekday", () => {
    expect(validateAvailability([{ weekday: 1, startTime: "09:00", endTime: "10:00" }, { weekday: 1, startTime: "09:30", endTime: "11:00" }], 20).length).toBe(1);
  });
});
