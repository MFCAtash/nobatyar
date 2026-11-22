import { describe, expect, it } from "vitest";
import { groupByKind, MeasurementError, parseMeasurement, trendOf, validateRange, type TimelinePoint } from "./timeline";
import { findInteractions, normalizeItems, reconcile } from "./medications";

describe("M9 timeline — measurement parsing", () => {
  it("parses weight/glucose with Persian digits", () => {
    expect(parseMeasurement("WEIGHT", "۷۲.۵").primary).toBe(72.5);
    expect(parseMeasurement("GLUCOSE", "110").unit).toBe("mg/dL");
  });

  it("validates blood pressure shape and ordering", () => {
    const bp = parseMeasurement("BP", "120 / 80");
    expect(bp).toMatchObject({ primary: 120, secondary: 80, unit: "mmHg" });
    expect(() => parseMeasurement("BP", "80/120")).toThrow(MeasurementError);
    expect(() => parseMeasurement("BP", "120")).toThrow(MeasurementError);
    expect(() => parseMeasurement("BP", "500/80")).toThrow(MeasurementError);
  });

  it("rejects out-of-range and non-numeric values", () => {
    expect(() => parseMeasurement("WEIGHT", "900")).toThrow(MeasurementError);
    expect(() => parseMeasurement("GLUCOSE", "abc")).toThrow(MeasurementError);
    expect(() => parseMeasurement("LAB", "")).toThrow(MeasurementError);
  });

  it("keeps lab units but truncates them", () => {
    expect(parseMeasurement("LAB", "5.2", "mg/L").unit).toBe("mg/L");
    expect(parseMeasurement("LAB", "5.2", "x".repeat(40)).unit).toHaveLength(16);
  });
});

describe("M9 timeline — trends", () => {
  const p = (at: string, primary: number): TimelinePoint => ({
    id: at, kind: "WEIGHT", at, primary, unit: "kg",
  });

  it("computes direction from the two latest points", () => {
    expect(trendOf([])).toMatchObject({ count: 0, direction: "unknown" });
    expect(trendOf([p("2026-01-01", 80)])).toMatchObject({ latest: 80, delta: null });
    expect(trendOf([p("2026-01-02", 81), p("2026-01-01", 80)])).toMatchObject({ delta: 1, direction: "up" });
    expect(trendOf([p("2026-01-01", 80), p("2026-01-02", 80)])).toMatchObject({ delta: 0, direction: "flat" });
  });

  it("groups and sorts points", () => {
    const g = groupByKind([p("2026-01-02", 81), p("2026-01-01", 80)]);
    expect(g.WEIGHT.map((x) => x.primary)).toEqual([80, 81]);
    expect(g.BP).toEqual([]);
  });

  it("validates ranges", () => {
    expect(() => validateRange(new Date("2026-02-01"), new Date("2026-01-01"))).toThrow(MeasurementError);
    expect(() => validateRange(new Date("2000-01-01"), new Date("2026-01-01"))).toThrow(MeasurementError);
    expect(() => validateRange(new Date("2026-01-01"), new Date("2026-02-01"))).not.toThrow();
  });
});

describe("M9 medications — reconciliation", () => {
  it("normalizes, dedupes and caps items", () => {
    const items = normalizeItems([
      { name: "  متوفرمین " },
      { name: "متوفرمین" },
      { name: "a" },
      ...Array.from({ length: 60 }, (_, i) => ({ name: `دارو ${i}` })),
    ]);
    expect(items[0].name).toBe("متوفرمین");
    expect(items).toHaveLength(50);
  });

  it("flags known pairs as non-diagnostic warnings", () => {
    const w = findInteractions([{ name: "Warfarin 5mg" }, { name: "آسپرین" }]);
    expect(w).toHaveLength(0); // نام فارسی/انگلیسی مخلوط عمداً هشدار نمی‌دهد مگر تطابق داشته باشد
    const w2 = findInteractions([{ name: "warfarin" }, { name: "aspirin 81" }]);
    expect(w2[0]).toMatchObject({ severity: "attention" });
  });

  it("reports items missing from the new report", () => {
    const r = reconcile([{ name: "metformin" }, { name: "statin" }], [{ name: "Metformin" }]);
    expect(r.items).toHaveLength(1);
    expect(r.missingFromReport).toEqual(["statin"]);
  });
});
