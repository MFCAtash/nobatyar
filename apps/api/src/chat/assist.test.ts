import { describe, expect, it } from "vitest";
import {
  buildSummary,
  dedupeQuickReplies,
  normalizeQuickReply,
  parseStoredSummary,
  redactSensitive,
  serializeSummary,
} from "./assist";

describe("M7 assist — redaction", () => {
  it("removes phone, email and national id", () => {
    const r = redactSensitive("تماس 09121234567 یا +989121234567 و a@b.com کد 1234567890");
    expect(r.text).not.toContain("09121234567");
    expect(r.text).not.toContain("a@b.com");
    expect(r.text).not.toContain("1234567890");
    expect(r.redactions).toBeGreaterThanOrEqual(3);
  });

  it("keeps clinical numbers intact", () => {
    const r = redactSensitive("فشار 120/80 و قند 110");
    expect(r.text).toBe("فشار 120/80 و قند 110");
    expect(r.redactions).toBe(0);
  });

  it("strips control chars and collapses spaces", () => {
    expect(redactSensitive("سلام\u0000  دنیا").text).toBe("سلام دنیا");
  });
});

describe("M7 assist — summary", () => {
  const msgs = [
    { speaker: "PATIENT" as const, text: "سردرد از دیروز" },
    { speaker: "DOCTOR" as const, text: "تب دارید؟" },
    { speaker: "PATIENT" as const, text: "بله ۳۸.۵ و شماره‌ام 09121234567" },
    { speaker: "PATIENT" as const, text: "بله ۳۸.۵ و شماره‌ام 09121234567" },
    { speaker: "PATIENT" as const, text: "   " },
  ];

  it("dedupes, redacts and labels speakers", () => {
    const r = buildSummary(msgs);
    expect(r.considered).toBe(4);
    expect(r.bullets).toHaveLength(3);
    expect(r.bullets[0]).toBe("بیمار: سردرد از دیروز");
    expect(r.bullets[2]).toContain("[تلفن]");
    expect(r.redactions).toBeGreaterThan(0);
  });

  it("keeps only the most recent bullets", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ speaker: "PATIENT" as const, text: `پیام ${i}` }));
    const r = buildSummary(many, { maxBullets: 5 });
    expect(r.bullets).toHaveLength(5);
    expect(r.bullets[4]).toContain("پیام 29");
  });

  it("round-trips storage and tolerates corrupt payloads", () => {
    const r = buildSummary(msgs);
    const stored = parseStoredSummary(serializeSummary(r, new Date("2026-01-01T00:00:00Z")));
    expect(stored?.bullets).toEqual(r.bullets);
    expect(stored?.generatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(parseStoredSummary("{{{")).toBeNull();
    expect(parseStoredSummary('{"v":2}')).toBeNull();
  });
});

describe("M7 assist — quick replies", () => {
  it("normalizes and dedupes, respecting the cap", () => {
    expect(normalizeQuickReply("  a  ")).toBeNull(); // کمتر از ۲ کاراکتر
    expect(normalizeQuickReply("x".repeat(301))).toBeNull();
    const out = dedupeQuickReplies(["سلام", " سلام ", "سلام", "چشم", ...Array.from({ length: 20 }, (_, i) => `پاسخ ${i}`)]);
    expect(out[0]).toBe("سلام");
    expect(out[1]).toBe("چشم");
    expect(out).toHaveLength(10);
  });
});
