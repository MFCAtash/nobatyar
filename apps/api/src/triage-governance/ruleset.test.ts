import { describe, expect, it } from "vitest";
import {
  compareVersion,
  EMERGENCY_NOTICE_FA,
  evaluateRuleSet,
  validateRuleSet,
  type RuleSet,
} from "./ruleset";

const base: RuleSet = {
  version: "1.0.0",
  approvedByLabel: "کمیتهٔ بالینی — ۱۴۰۵/۰۹",
  rules: [
    { id: "chest", anyOf: ["درد قفسه سینه", "تنگی نفس شدید"], level: "EMERGENCY", explanationFa: "این نشانه‌ها نیازمند ارزیابی فوری اورژانسی هستند." },
    { id: "fever", anyOf: ["تب بالا"], level: "URGENT", explanationFa: "تب بالا در بزرگسال نیازمند بررسی پزشک در همان روز است." },
  ],
};

describe("M10 ruleset — validation", () => {
  it("accepts a valid rule set", () => {
    expect(validateRuleSet(base)).toEqual([]);
  });

  it("requires an emergency rule and semver", () => {
    const errs = validateRuleSet({ ...base, version: "1", rules: base.rules.filter((r) => r.level !== "EMERGENCY") });
    expect(errs.join(",")).toContain("semver");
    expect(errs.join(",")).toContain("EMERGENCY");
  });

  it("rejects forbidden diagnostic claims, duplicates and empty symptoms", () => {
    const bad: RuleSet = {
      ...base,
      rules: [
        ...base.rules,
        { id: "chest", anyOf: [], level: "ROUTINE", explanationFa: "تشخیص قطعی بدون نیاز به پزشک" },
      ],
    };
    const errs = validateRuleSet(bad).join("|");
    expect(errs).toContain("duplicate rule id");
    expect(errs).toContain("forbidden claim");
    expect(errs).toContain("at least one symptom");
  });
});

describe("M10 ruleset — evaluation", () => {
  it("picks the highest matched level and explains why", () => {
    const e = evaluateRuleSet(base, ["تب بالا", "درد قفسه سینه"]);
    expect(e.level).toBe("EMERGENCY");
    expect(e.matched).toEqual(["chest", "fever"]);
    expect(e.explanationFa).toContain("اورژانسی");
    expect(e.emergencyNoticeFa).toBe(EMERGENCY_NOTICE_FA);
  });

  it("is case/space insensitive and returns routine when nothing matches", () => {
    expect(evaluateRuleSet(base, ["  تب   بالا "]).level).toBe("URGENT");
    const none = evaluateRuleSet(base, ["سردرد خفیف"]);
    expect(none.level).toBe("ROUTINE");
    expect(none.matched).toEqual([]);
    expect(none.explanationFa).toContain("قواعد اورژانسی");
  });

  it("compares versions", () => {
    expect(compareVersion("1.2.0", "1.10.0")).toBeLessThan(0);
    expect(compareVersion("2.0.0", "2.0.0")).toBe(0);
  });
});
