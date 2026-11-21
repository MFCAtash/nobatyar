import { describe, expect, it } from "vitest";
import { isExclusionViolation } from "./errors";

describe("isExclusionViolation", () => {
  it("recognises Prisma raw-query and message forms", () => {
    expect(isExclusionViolation({ code: "P2010", meta: { code: "23P01" } })).toBe(true);
    expect(isExclusionViolation(new Error('conflicting key value violates exclusion constraint "no_double_booking"'))).toBe(true);
    expect(isExclusionViolation(new Error("... code: 23P01 ..."))).toBe(true);
  });
  it("ignores unrelated errors", () => {
    expect(isExclusionViolation(new Error("connection reset"))).toBe(false);
    expect(isExclusionViolation({ code: "P2002" })).toBe(false);
    expect(isExclusionViolation(null)).toBe(false);
  });
});
