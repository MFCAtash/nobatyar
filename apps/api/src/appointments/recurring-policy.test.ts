import { describe, expect, it } from "vitest";
import { nextOccurrences, parseRRule } from "./recurring-policy";

describe("policy رزرو تکرارشونده", () => {
  it("قواعد معتبر را تجزیه میکند", () => {
    expect(parseRRule("FREQ=WEEKLY;INTERVAL=2;COUNT=4")).toEqual({ freq: "WEEKLY", interval: 2, count: 4 });
    expect(parseRRule("FREQ=MONTHLY")).toEqual({ freq: "MONTHLY", interval: 1, count: 1 });
  });

  it("قواعد مخرب/نامحدود را رد میکند", () => {
    expect(() => parseRRule("FREQ=DAILY")).toThrow();
    expect(() => parseRRule("FREQ=WEEKLY;COUNT=999")).toThrow();
    expect(() => parseRRule("FREQ=WEEKLY;INTERVAL=0")).toThrow();
    expect(() => parseRRule("FREQ=WEEKLY;UNTIL=...")).toThrow();
  });

  it("تاریخها را با فاصلهٔ درست تولید میکند", () => {
    const anchor = new Date("2026-01-01T10:00:00Z");
    const dates = nextOccurrences(anchor, { freq: "WEEKLY", interval: 2, count: 3 });
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-01-01", "2026-01-15", "2026-01-29"]);
  });
});
