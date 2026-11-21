import { describe, expect, it } from "vitest";
import { clinicalWindowOpen, formatHoursLeft, hoursLeft, splitLines, URGENCY_UI } from "./clinical";

describe("clinical helpers", () => {
  it("همه‌ی سطوح فوریت برچسب دارند و EMERGENCY قرمز است", () => {
    expect(Object.keys(URGENCY_UI)).toHaveLength(5);
    expect(URGENCY_UI.EMERGENCY.tone).toBe("bad");
  });
  it("مهلت", () => {
    const now = Date.parse("2026-10-20T10:00:00Z");
    expect(hoursLeft("2026-10-20T13:00:00Z", now)).toBe(3);
    expect(formatHoursLeft(0)).toBe("مهلت تمام شده");
    expect(formatHoursLeft(0.5)).toBe("کمتر از یک ساعت");
    expect(formatHoursLeft(72)).toContain("۳");
  });
  it("splitLines: خط/ویرگول، بدون خالی و تکراری", () => {
    expect(splitLines("پنی‌سیلین\n\n گردو ،پنی‌سیلین")).toEqual(["پنی‌سیلین", "گردو"]);
  });
  it("پنجره‌ی بالینی ۷ روزه", () => {
    const end = "2026-10-20T10:00:00Z", t = Date.parse(end);
    expect(clinicalWindowOpen("IN_PROGRESS", end, t + 99 * 86_400_000)).toBe(true);
    expect(clinicalWindowOpen("COMPLETED", end, t + 6 * 86_400_000)).toBe(true);
    expect(clinicalWindowOpen("COMPLETED", end, t + 8 * 86_400_000)).toBe(false);
    expect(clinicalWindowOpen("CONFIRMED", end, t)).toBe(false);
  });
});
