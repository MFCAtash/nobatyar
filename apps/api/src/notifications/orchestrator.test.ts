import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  filterByTemplate,
  inQuietHours,
  mergePreferences,
  parseClock,
  parseTemplateChannels,
  pickActiveTemplate,
  renderTemplate,
  sanitizeVar,
  selectChannels,
  TemplateError,
  type PreferenceRow,
} from "./orchestrator";

describe("M5 orchestrator — quiet hours", () => {
  it("parses valid clocks and rejects junk", () => {
    expect(parseClock("22:00")).toBe(1320);
    expect(parseClock("07:05")).toBe(425);
    expect(parseClock("24:00")).toBeNull();
    expect(parseClock("9:00")).toBeNull();
    expect(parseClock(null)).toBeNull();
  });

  it("handles same-day and overnight windows", () => {
    expect(inQuietHours(13 * 60, "12:00", "14:00")).toBe(true);
    expect(inQuietHours(15 * 60, "12:00", "14:00")).toBe(false);
    expect(inQuietHours(23 * 60, "22:00", "07:00")).toBe(true);
    expect(inQuietHours(6 * 60 + 59, "22:00", "07:00")).toBe(true);
    expect(inQuietHours(7 * 60, "22:00", "07:00")).toBe(false);
    expect(inQuietHours(12 * 60, "22:00", "22:00")).toBe(false);
    expect(inQuietHours(12 * 60, null, "22:00")).toBe(false);
  });

  it("wraps negative/large minute values safely", () => {
    expect(inQuietHours(-60, "22:00", "07:00")).toBe(true); // -60 ⇒ 23:00
    expect(inQuietHours(1440 + 60, "22:00", "07:00")).toBe(true); // 25:00 ⇒ 01:00
  });
});

describe("M5 orchestrator — preferences and channel selection", () => {
  it("merges user rows over defaults and ignores unknown keys", () => {
    const rows: PreferenceRow[] = [
      { eventType: "PAYMENT", channel: "sms", enabled: true },
      { eventType: "CHAT", channel: "push", enabled: false },
      { eventType: "NOPE", channel: "sms", enabled: true },
      { eventType: "PAYMENT", channel: "pigeon", enabled: true },
    ];
    const p = mergePreferences(rows);
    expect(p.PAYMENT.sms).toBe(true);
    expect(p.CHAT.push).toBe(false);
    expect(p.APPOINTMENT_REMINDER.sms).toBe(true);
    expect(p).not.toHaveProperty("NOPE");
  });

  it("suppresses intrusive channels during quiet hours but keeps inapp", () => {
    const got = selectChannels({
      eventType: "APPOINTMENT_REMINDER",
      prefs: DEFAULT_PREFERENCES,
      nowMinutes: 23 * 60,
      quietFrom: "22:00",
      quietTo: "07:00",
    });
    expect(got).toEqual(["inapp"]);
  });

  it("urgent bypasses quiet hours", () => {
    const got = selectChannels({
      eventType: "SECURITY",
      prefs: DEFAULT_PREFERENCES,
      nowMinutes: 23 * 60,
      quietFrom: "22:00",
      quietTo: "07:00",
      urgent: true,
    });
    expect(got).toContain("sms");
    expect(got).toContain("email");
  });

  it("respects explicit opt-out and never invents channels", () => {
    const prefs = structuredClone(DEFAULT_PREFERENCES);
    prefs.APPOINTMENT_REMINDER = { inapp: true, sms: false, push: false, email: false };
    expect(
      selectChannels({ eventType: "APPOINTMENT_REMINDER", prefs, nowMinutes: 9 * 60 }),
    ).toEqual(["inapp"]);
  });
});

describe("M5 orchestrator — templates", () => {
  it("renders allowed vars and strips control characters", () => {
    const out = renderTemplate("سلام {{name}}، نوبت شما {{when}} است.", {
      name: "سارا\u0000",
      when: "فردا ۱۰:۰۰",
    });
    expect(out).toBe("سلام سارا، نوبت شما فردا ۱۰:۰۰ است.");
  });

  it("fails closed on missing vars instead of leaking raw placeholders", () => {
    expect(() => renderTemplate("سلام {{name}}", {})).toThrow(TemplateError);
  });

  it("truncates oversized values", () => {
    expect(sanitizeVar("x".repeat(500))).toHaveLength(200);
  });

  it("picks highest enabled version and parses channels defensively", () => {
    const rows = [
      { key: "reminder", version: 1, channels: '["sms"]', bodyFa: "a", enabled: true },
      { key: "reminder", version: 2, channels: '["sms","push"]', bodyFa: "b", enabled: true },
      { key: "reminder", version: 3, channels: '["sms"]', bodyFa: "c", enabled: false },
    ];
    expect(pickActiveTemplate(rows, "reminder")?.version).toBe(2);
    expect(pickActiveTemplate(rows, "missing")).toBeNull();
    expect(parseTemplateChannels('["sms","pigeon"]')).toEqual(["sms"]);
    expect(parseTemplateChannels("not-json")).toBeNull();
    expect(parseTemplateChannels("[]")).toBeNull();
  });

  it("filters channels by template allow-list", () => {
    const tpl = { key: "reminder", version: 1, channels: '["inapp","sms"]', bodyFa: "x", enabled: true };
    expect(filterByTemplate(["inapp", "push", "sms"], tpl)).toEqual(["inapp", "sms"]);
    expect(filterByTemplate(["inapp", "push"], null)).toEqual(["inapp", "push"]);
  });
});
