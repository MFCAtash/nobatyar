import { describe, expect, it } from "vitest";
import {
  alertSeverity,
  authorizeChaos,
  authorizeRunbook,
  burnRate,
  computeBurn,
  errorBudget,
  parseObjective,
  remainingBudgetPct,
  windowMs,
  type BurnSample,
  type SloTarget,
} from "./slo";

const target: SloTarget = { service: "api", objective: 99.9, window: "30d" };

describe("M11 SLO — budget and burn", () => {
  it("validates objectives", () => {
    expect(parseObjective(99.9)).toBe(99.9);
    expect(() => parseObjective(0)).toThrow();
    expect(() => parseObjective(100)).toThrow();
    expect(() => parseObjective(Number.NaN)).toThrow();
  });

  it("computes error budget", () => {
    expect(errorBudget(target)).toBeCloseTo(0.001, 6);
    expect(errorBudget({ ...target, objective: 99 })).toBeCloseTo(0.01, 6);
  });

  it("computes burn rate and clamps invalid input", () => {
    expect(burnRate(target, 0.001)).toBeCloseTo(1, 3);
    expect(burnRate(target, 0.0144)).toBeCloseTo(14.4, 1);
    expect(burnRate(target, -5)).toBe(0);
    expect(burnRate(target, Number.NaN)).toBe(0);
    expect(burnRate(target, 5)).toBeCloseTo(1000, 3);
  });

  it("marks small samples as not significant", () => {
    const samples: BurnSample[] = [
      { window: "1h", errorRate: 0.05, requests: 5 },
      { window: "6h", errorRate: 0.05, requests: 500 },
    ];
    const r = computeBurn(target, samples);
    expect(r[0].significant).toBe(false);
    expect(r[1].significant).toBe(true);
  });

  it("computes remaining budget percentage", () => {
    expect(remainingBudgetPct(target, 0)).toBe(100);
    expect(remainingBudgetPct(target, 0.0005)).toBeCloseTo(50, 1);
    expect(remainingBudgetPct(target, 0.01)).toBe(0);
  });

  it("exposes window durations", () => {
    expect(windowMs("1h")).toBe(3_600_000);
    expect(windowMs("30d")).toBe(2_592_000_000);
  });
});

describe("M11 SLO — multi-window alert policy", () => {
  const mk = (w: "1h" | "6h" | "1d", burn: number, significant = true) => ({
    window: w,
    burnRate: burn,
    budget: 0.001,
    significant,
  });

  it("returns ok when nothing is burning", () => {
    expect(alertSeverity([mk("1h", 1), mk("6h", 1), mk("1d", 0.2)])).toBe("ok");
  });

  it("pages on a single fast window", () => {
    expect(alertSeverity([mk("1h", 20), mk("6h", 2), mk("1d", 0.5)])).toBe("page");
    expect(alertSeverity([mk("1h", 1), mk("6h", 7), mk("1d", 0.5)])).toBe("page");
  });

  it("rolls back only when both fast windows burn hard", () => {
    expect(alertSeverity([mk("1h", 15), mk("6h", 15), mk("1d", 1)])).toBe("rollback");
  });

  it("opens a ticket on slow burn", () => {
    expect(alertSeverity([mk("1h", 1), mk("6h", 1), mk("1d", 1.5)])).toBe("ticket");
  });

  it("ignores insignificant samples", () => {
    expect(alertSeverity([mk("1h", 20, false), mk("6h", 20, false), mk("1d", 5, false)])).toBe("ok");
  });
});

describe("M11 chaos — safety gates", () => {
  const base = {
    target: "redis",
    environment: "staging",
    nowMinutes: 10 * 60,
    approved: true,
  };

  it("is always disabled in production", () => {
    expect(authorizeChaos({ ...base, environment: "production" }).reason).toBe("chaos_disabled_in_production");
  });

  it("requires approval and allow-listed target", () => {
    expect(authorizeChaos({ ...base, approved: false }).reason).toBe("approval_required");
    expect(authorizeChaos({ ...base, target: "postgres-primary" }).reason).toBe("target_not_allowed");
  });

  it("honors the change window", () => {
    expect(authorizeChaos({ ...base, windowFrom: "01:00", windowTo: "05:00" }).reason).toBe("outside_change_window");
    expect(authorizeChaos({ ...base, nowMinutes: 2 * 60, windowFrom: "01:00", windowTo: "05:00" }).allowed).toBe(true);
    expect(authorizeChaos({ ...base, nowMinutes: 23 * 60, windowFrom: "22:00", windowTo: "02:00" }).allowed).toBe(true);
  });

  it("always plans auto-rollback", () => {
    expect(authorizeChaos(base).autoRollback).toBe(true);
  });

  it("restricts runbooks", () => {
    expect(authorizeRunbook("restore-drill", "staging").allowed).toBe(true);
    expect(authorizeRunbook("restore-drill", "production").reason).toBe("production_requires_ci");
    expect(authorizeRunbook("rm-rf", "staging").reason).toBe("unknown_runbook");
  });
});
