import { describe, expect, it } from "vitest";
import { CALL_CHANNEL, escalationTarget, shouldEscalate, type EscalationDecision } from "./escalation";

const base = (over: Partial<EscalationDecision> = {}): EscalationDecision => ({
  eventType: "SECURITY",
  retryCount: 0,
  urgent: false,
  quiet: false,
  acknowledged: false,
  ...over,
});

describe("M5 phone escalation — policy", () => {
  it("uses a dedicated call channel", () => {
    expect(CALL_CHANNEL).toBe("call");
  });

  it("escalates urgent from retry 1, non-urgent only from retry 3", () => {
    expect(shouldEscalate(base({ urgent: true, retryCount: 0 }))).toBe(false);
    expect(shouldEscalate(base({ urgent: true, retryCount: 1 }))).toBe(true);
    expect(shouldEscalate(base({ urgent: true, retryCount: 5 }))).toBe(true);

    expect(shouldEscalate(base({ retryCount: 1 }))).toBe(false);
    expect(shouldEscalate(base({ retryCount: 2 }))).toBe(false);
    expect(shouldEscalate(base({ retryCount: 3 }))).toBe(true);
    expect(shouldEscalate(base({ retryCount: 4 }))).toBe(true);
  });

  it("never escalates acknowledged events", () => {
    expect(shouldEscalate(base({ urgent: true, retryCount: 9, acknowledged: true }))).toBe(false);
    expect(shouldEscalate(base({ retryCount: 9, acknowledged: true }))).toBe(false);
  });

  it("quiet hours do not block urgent escalation", () => {
    expect(shouldEscalate(base({ urgent: true, retryCount: 1, quiet: true }))).toBe(true);
  });

  it("quiet hours block non-urgent escalation", () => {
    expect(shouldEscalate(base({ retryCount: 5, quiet: true }))).toBe(false);
  });

  it("caps attempted call count in 1..3", () => {
    expect(escalationTarget(0)).toBe(1);
    expect(escalationTarget(1)).toBe(1);
    expect(escalationTarget(2)).toBe(2);
    expect(escalationTarget(3)).toBe(3);
    expect(escalationTarget(99)).toBe(3);
  });
});
