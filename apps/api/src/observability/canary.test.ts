import { describe, expect, it } from "vitest";
import { CANARY_WEIGHTS, decideCanary, isValidWeights, nextWeight, type CanarySignal } from "./canary";

const ok: CanarySignal = {
  errorRate1h: 0.001,
  errorRate6h: 0.001,
  burnRate: 0.5,
  significant: true,
  previousHealthy: true,
};

describe("M11 canary decision", () => {
  it("promotes a healthy canary", () => {
    expect(decideCanary(ok)).toBe("promote");
  });

  it("holds on budget burn, weak samples or unhealthy predecessor", () => {
    expect(decideCanary({ ...ok, burnRate: 1.2 })).toBe("hold");
    expect(decideCanary({ ...ok, significant: false })).toBe("hold");
    expect(decideCanary({ ...ok, previousHealthy: false })).toBe("hold");
  });

  it("rolls back on severe burn and invalid input", () => {
    expect(decideCanary({ ...ok, burnRate: 6 })).toBe("rollback");
    expect(decideCanary({ ...ok, burnRate: Number.NaN })).toBe("rollback");
  });

  it("holds on a fast-window error spike even when average burn is low", () => {
    expect(decideCanary({ ...ok, errorRate1h: 0.02, errorRate6h: 0.005 })).toBe("hold");
  });

  it("validates weight progression", () => {
    expect(isValidWeights([...CANARY_WEIGHTS])).toBe(true);
    expect(isValidWeights([])).toBe(false);
    expect(isValidWeights([1, 1, 100])).toBe(false);
    expect(isValidWeights([1, 50])).toBe(false);
    expect(nextWeight(CANARY_WEIGHTS, 5)).toBe(10);
    expect(nextWeight(CANARY_WEIGHTS, 100)).toBeNull();
  });
});
