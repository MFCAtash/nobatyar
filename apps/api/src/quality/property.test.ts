import { describe, expect, it } from "vitest";
import { evaluateRuleSet, type RuleSet, type TriageLevel } from "../triage-governance/ruleset";
import { normalizePolicy } from "../video/room-policy";
import { parseMeasurement, trendOf, type TimelinePoint } from "../patient-record/timeline";
import { burnRate, errorBudget, type SloTarget } from "../observability/slo";

/**
 * M12 — تست‌های property-style بدون وابستگی خارجی.
 *
 * از یک PRNG قطعی (LCG) استفاده می‌کنیم تا اجراها تکرارپذیر باشند و در CI
 * بدون نصب ابزار جدید اجرا شوند. هر property با ۵۰۰ ورودی تصادفی بررسی می‌شود.
 */

/** LCG با ضریب‌های عددی شناخته‌شده (Numerical Recipes). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

const RUNS = 500;

describe("M12 property — triage evaluation", () => {
  const rs: RuleSet = {
    version: "1.0.0",
    approvedByLabel: "property-test",
    rules: [
      { id: "e1", anyOf: ["a", "b"], level: "EMERGENCY", explanationFa: "نشانهٔ اورژانسی برای آزمایش." },
      { id: "u1", anyOf: ["c"], level: "URGENT", explanationFa: "نشانهٔ فوری برای آزمایش." },
      { id: "r1", anyOf: ["d"], level: "ROUTINE", explanationFa: "نشانهٔ روتین برای آزمایش." },
    ],
  };
  const rank: Record<TriageLevel, number> = { ROUTINE: 0, URGENT: 1, EMERGENCY: 2 };
  const all = ["a", "b", "c", "d", "z"];

  it("always returns the maximum level among matched rules and never empty explanation", () => {
    const r = rng(42);
    for (let i = 0; i < RUNS; i++) {
      const symptoms = all.filter(() => r() > 0.5);
      const e = evaluateRuleSet(rs, symptoms);
      const expected = rs.rules
        .filter((rule) => rule.anyOf.some((s) => symptoms.includes(s)))
        .reduce<TriageLevel>((acc, rule) => (rank[rule.level] > rank[acc] ? rule.level : acc), "ROUTINE");
      expect(e.level).toBe(expected);
      expect(e.explanationFa.length).toBeGreaterThan(0);
      expect(e.emergencyNoticeFa).toContain("۱۱۵");
    }
  });
});

describe("M12 property — timeline trends", () => {
  it("direction always agrees with the sign of delta", () => {
    const r = rng(7);
    for (let i = 0; i < RUNS; i++) {
      const n = 1 + Math.floor(r() * 6);
      const points: TimelinePoint[] = Array.from({ length: n }, (_, k) => ({
        id: `p${k}`,
        kind: "WEIGHT",
        at: new Date(Date.UTC(2026, 0, 1 + k)).toISOString(),
        primary: 40 + r() * 100,
        unit: "kg",
      }));
      const t = trendOf(points);
      expect(t.count).toBe(n);
      if (n === 1) {
        expect(t.direction).toBe("unknown");
      } else if (t.delta === 0) {
        expect(t.direction).toBe("flat");
      } else if ((t.delta ?? 0) > 0) {
        expect(t.direction).toBe("up");
      } else {
        expect(t.direction).toBe("down");
      }
    }
  });
});

describe("M12 property — measurement parsing", () => {
  it("accepts every in-range weight and rejects out-of-range values", () => {
    const r = rng(99);
    for (let i = 0; i < RUNS; i++) {
      const v = 2 + r() * 398;
      const m = parseMeasurement("WEIGHT", v.toFixed(2));
      expect(m.primary).toBeCloseTo(Number(v.toFixed(2)), 2);
      expect(m.unit).toBe("kg");
      expect(() => parseMeasurement("WEIGHT", "500")).toThrow();
    }
  });
});

describe("M12 property — room policy clamping", () => {
  it("retention is always null or within [1,720] and booleans are real booleans", () => {
    const r = rng(2026);
    for (let i = 0; i < RUNS; i++) {
      const hours = r() < 0.2 ? null : Math.floor(r() * 5000) - 100;
      const p = normalizePolicy({ retentionHours: hours });
      if (hours === null) expect(p.retentionHours).toBeNull();
      else expect(p.retentionHours).toBeGreaterThanOrEqual(1);
      if (p.retentionHours !== null) expect(p.retentionHours).toBeLessThanOrEqual(720);
      expect(typeof p.waitingRoom).toBe("boolean");
      expect(typeof p.recordConsent).toBe("boolean");
    }
  });
});

describe("M12 property — SLO burn", () => {
  it("burn rate is non-negative and monotone in error rate", () => {
    const target: SloTarget = { service: "api", objective: 99.9, window: "30d" };
    const r = rng(5150);
    for (let i = 0; i < RUNS; i++) {
      const a = r();
      const b = Math.min(1, a + r());
      expect(burnRate(target, a)).toBeGreaterThanOrEqual(0);
      expect(burnRate(target, b)).toBeGreaterThanOrEqual(burnRate(target, a));
    }
    expect(errorBudget(target)).toBeGreaterThan(0);
  });
});
