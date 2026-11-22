import { describe, expect, it } from "vitest";
import {
  anonymousId,
  classifyNps,
  computeCohorts,
  computeFunnel,
  FunnelError,
  hashMeta,
  npsScore,
  sanitizeMeta,
} from "./funnel";

describe("M13 funnel — privacy", () => {
  it("hashes anonymous ids with salt and never returns raw input", () => {
    const h = anonymousId("device-123456", "salt");
    expect(h).toHaveLength(32);
    expect(h).not.toContain("device");
    expect(anonymousId("device-123456", "other")).not.toBe(h);
    expect(() => anonymousId("short", "salt")).toThrow(FunnelError);
  });

  it("rejects non-allow-listed meta keys and PII-looking values", () => {
    expect(sanitizeMeta({ role: "patient", step_ms: 120 })).toEqual({ role: "patient", step_ms: "120" });
    expect(() => sanitizeMeta({ name: "Sara" })).toThrow(FunnelError);
    expect(() => sanitizeMeta({ role: "09121234567" })).toThrow(FunnelError);
    expect(() => sanitizeMeta({ role: "a@b.com" })).toThrow(FunnelError);
    expect(() => sanitizeMeta({ role: { nested: true } as unknown as string })).toThrow(FunnelError);
  });

  it("hashes meta deterministically and ignores key order", () => {
    expect(hashMeta({}, "s")).toBeNull();
    const h1 = hashMeta({ role: "patient", channel: "web" }, "s");
    const h2 = hashMeta({ channel: "web", role: "patient" }, "s");
    expect(h1).toBe(h2);
    expect(h1).not.toBe(hashMeta({ role: "doctor", channel: "web" }, "s"));
  });
});

describe("M13 funnel — counting", () => {
  it("counts unique users per step and computes step conversions", () => {
    const events = [
      { anonymousId: "a", step: "SEARCH" },
      { anonymousId: "b", step: "SEARCH" },
      { anonymousId: "a", step: "SEARCH" }, // duplicate
      { anonymousId: "a", step: "SLOT_VIEW" },
      { anonymousId: "b", step: "SLOT_VIEW" },
      { anonymousId: "a", step: "BOOKING_CONFIRMED" },
      { anonymousId: "x", step: "UNKNOWN" },
    ];
    const f = computeFunnel(events);
    expect(f.map((x) => x.count)).toEqual([2, 2, 0, 0, 0, 1]);
    expect(f[0].conversionFromPrev).toBe(1);
    expect(f[1].conversionFromPrev).toBe(1);
    expect(f[2].conversionFromPrev).toBe(0);
  });

  it("handles empty input", () => {
    const f = computeFunnel([]);
    expect(f).toHaveLength(6);
    expect(f.every((x) => x.count === 0)).toBe(true);
  });
});

describe("M13 funnel — cohorts", () => {
  it("groups users by first week and computes weekly retention", () => {
    const events = [
      { anonymousId: "a", at: new Date("2026-01-05T10:00:00Z") }, // Mon
      { anonymousId: "a", at: new Date("2026-01-12T10:00:00Z") },
      { anonymousId: "b", at: new Date("2026-01-06T10:00:00Z") },
      { anonymousId: "c", at: new Date("2026-01-13T10:00:00Z") },
    ];
    const rows = computeCohorts(events, { maxWeeks: 3 });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ cohort: "2026-01-05", size: 2 });
    expect(rows[0].retention[0]).toBe(1);
    expect(rows[0].retention[1]).toBe(0.5);
    expect(rows[1]).toMatchObject({ cohort: "2026-01-12", size: 1 });
  });
});

describe("M13 funnel — NPS", () => {
  it("classifies scores and computes NPS", () => {
    expect(classifyNps(10)).toBe("promoter");
    expect(classifyNps(9)).toBe("promoter");
    expect(classifyNps(8)).toBe("passive");
    expect(classifyNps(6)).toBe("detractor");
    expect(() => classifyNps(11)).toThrow(FunnelError);
    expect(npsScore([10, 9, 8, 6, 0])).toBe(0);
    expect(npsScore([10, 9, 9, 6])).toBe(50);
    expect(npsScore([])).toBe(0);
  });
});
