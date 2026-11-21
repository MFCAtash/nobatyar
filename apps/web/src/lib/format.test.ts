import { describe, expect, it } from "vitest";
import {
  dayLabelFromDateStr, estimateRefundPercent, formatCountdown, formatJalaliDate, formatNumber, formatTime, formatToman,
  nextTehranDays, safeNext, tehranDateStr, tehranLocalToIso, toAsciiDigits,
} from "./format";

describe("Tehran / Jalali formatting", () => {
  it("formats time in Tehran (UTC+3:30)", () => expect(formatTime("2026-10-13T05:30:00Z")).toBe("۰۹:۰۰"));
  it("converts to Jalali, including leap-year edges", () => {
    expect(formatJalaliDate("2026-10-13T05:30:00Z")).toBe("۱۴۰۵/۰۷/۲۱");
    expect(formatJalaliDate("2025-03-20T12:00:00Z")).toBe("۱۴۰۳/۱۲/۳۰");
    expect(formatJalaliDate("2025-03-21T12:00:00Z")).toBe("۱۴۰۴/۰۱/۰۱");
    expect(formatJalaliDate("2026-03-21T12:00:00Z")).toBe("۱۴۰۵/۰۱/۰۱");
  });
  it("Tehran calendar date rolls over at 20:30 UTC", () => {
    expect(tehranDateStr(new Date("2026-10-13T20:00:00Z"))).toBe("2026-10-13");
    expect(tehranDateStr(new Date("2026-10-13T21:00:00Z"))).toBe("2026-10-14");
  });
  it("lists consecutive Tehran days and labels them", () => {
    expect(nextTehranDays(3, new Date("2026-10-13T10:00:00Z"))).toEqual(["2026-10-13", "2026-10-14", "2026-10-15"]);
    expect(dayLabelFromDateStr("2026-10-13")).toMatch(/سه‌شنبه.*۲۱.*مهر/);
  });
  it("datetime-local (Tehran wall time) → UTC ISO", () => {
    expect(tehranLocalToIso("2026-10-13T09:00")).toBe("2026-10-13T05:30:00.000Z");
    expect(tehranLocalToIso("garbage")).toBeNull();
    expect(tehranLocalToIso("")).toBeNull();
  });
});

describe("numbers and money", () => {
  it("shows rial amounts as toman, 0 as free", () => {
    expect(formatToman("3000000")).toBe("۳۰۰٬۰۰۰ تومان");
    expect(formatToman("0")).toBe("رایگان");
    expect(formatNumber("1234567")).toBe("۱٬۲۳۴٬۵۶۷");
  });
  it("normalises Persian/Arabic digits", () => expect(toAsciiDigits("۰۹۱۲٣٤٥")).toBe("0912345"));
  it("formats countdowns", () => {
    expect(formatCountdown(303)).toBe("۰۵:۰۳");
    expect(formatCountdown(-5)).toBe("۰۰:۰۰");
  });
  it("refund estimate tiers", () => {
    const t = new Date("2026-10-20T10:00:00Z");
    expect(estimateRefundPercent(t, new Date(+t - 30 * 3.6e6))).toBe(100);
    expect(estimateRefundPercent(t, new Date(+t - 5 * 3.6e6))).toBe(50);
    expect(estimateRefundPercent(t, new Date(+t - 1 * 3.6e6))).toBe(0);
  });
});

describe("safeNext (open-redirect guard)", () => {
  it("accepts internal paths only", () => {
    expect(safeNext("/appointments/1")).toBe("/appointments/1");
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil", "", null, undefined]) expect(safeNext(bad as string | null)).toBe("/");
  });
});

import { formatBadgeCount, formatBytes, formatDateInputValue, formatDigits, formatJalaliDateTime, formatJalaliMedium, formatLocalInputValue, toPersianDigits } from "./format";

describe("Persian numbers and dates (phase 16)", () => {
  it("year/code digits have no thousands separator", () => {
    expect(formatDigits(1370)).toBe("۱۳۷۰");
    expect(formatNumber(1370)).toBe("۱٬۳۷۰");
  });
  it("badge count caps at 99+", () => {
    expect(formatBadgeCount(5)).toBe("۵");
    expect(formatBadgeCount(100)).toBe("۹۹+");
  });
  it("bytes use Persian digits and units", () => {
    expect(formatBytes(512)).toBe("۵۱۲ بایت");
    expect(formatBytes(1536)).toBe("۱٫۵ کیلوبایت");
    expect(formatBytes(5 * 1024 * 1024)).toBe("۵٫۰ مگابایت");
  });
  it("medium and datetime Jalali", () => {
    expect(formatJalaliMedium("2026-10-13T05:30:00Z")).toBe("۲۱ مهر ۱۴۰۵");
    expect(formatJalaliDateTime("2026-10-13T05:30:00Z")).toBe("۱۴۰۵/۰۷/۲۱، ۰۹:۰۰");
  });
  it("converts digits to Persian for display", () => expect(toPersianDigits("0912 6")).toBe("۰۹۱۲ ۶"));
  it("date/datetime-local input previews", () => {
    expect(formatDateInputValue("2026-10-13")).toBe("۲۱ مهر ۱۴۰۵");
    expect(formatDateInputValue("bad")).toBe("");
    expect(formatLocalInputValue("2026-10-13T09:00")).toContain("۰۹:۰۰");
    expect(formatLocalInputValue("")).toBe("");
  });
});
