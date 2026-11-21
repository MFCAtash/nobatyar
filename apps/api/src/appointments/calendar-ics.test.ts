import { describe, expect, it } from "vitest";
import { buildIcs } from "./calendar-ics";

describe("خروجی تقویم", () => {
  const event = {
    uid: "11111111-1111-4111-8111-111111111111",
    start: new Date("2026-01-02T10:00:00Z"),
    end: new Date("2026-01-02T10:20:00Z"),
    summary: "نوبت نزد دکتر آرش نیکومنش",
    location: "تهران، خیابان ولیعصر، پلاک ۱۲",
    description: "جزئیات نوبت در نوبت‌یار",
  };

  it("ساختار استاندارد و CRLF دارد", () => {
    const ics = buildIcs(event);
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("BEGIN:VEVENT\r\n");
    expect(ics).toContain(`UID:${event.uid}@nobatyar`);
    expect(ics).toContain("DTSTART:20260102T100000Z");
    expect(ics.endsWith("\r\n")).toBe(true);
  });

  it("هیچ PHIای وارد نمیشود", () => {
    const ics = buildIcs({ ...event, description: undefined });
    expect(ics).not.toContain("دلیل مراجعه");
    expect(ics).not.toContain("کد ملی");
  });

  it("متنهای ویژه را escape میکند", () => {
    const ics = buildIcs({ ...event, summary: "a, b; c\nd" });
    expect(ics.replace(/\r\n /g, "")).toContain("SUMMARY:a\\, b\\; c\\nd");
  });
});
