import { describe, expect, it } from "vitest";
import { isFlagEnabled, MODULE_FLAG_DEFAULTS, MODULE_OF_FLAG, resolveModuleFlags } from "./flags";

describe("feature flagهای ماژولها", () => {
  it("همه بهصورت پیشفرض خاموشاند (fail-closed)", () => {
    const flags = resolveModuleFlags({});
    expect(Object.keys(flags)).toHaveLength(15);
    for (const key of Object.keys(flags) as (keyof typeof flags)[]) expect(flags[key]).toBe(false);
  });

  it("فقط مقدار دقیق true فعال میکند", () => {
    expect(isFlagEnabled("true")).toBe(true);
    expect(isFlagEnabled("TRUE")).toBe(false);
    expect(isFlagEnabled("1")).toBe(false);
    expect(isFlagEnabled(undefined)).toBe(false);
  });

  it("فعالسازی یک ماژول بقیه را تحت تأثیر قرار نمیدهد", () => {
    const flags = resolveModuleFlags({ FF_M7_CHAT_ASSIST: "true" });
    expect(flags.FF_M7_CHAT_ASSIST).toBe(true);
    expect(flags.FF_M6_SMART_FILES).toBe(false);
  });

  it("هر flag دقیقاً یک ماژول M1–M15 دارد", () => {
    const keys = Object.keys(MODULE_FLAG_DEFAULTS) as (keyof typeof MODULE_FLAG_DEFAULTS)[];
    expect(new Set(Object.values(MODULE_OF_FLAG)).size).toBe(15);
    for (const k of keys) expect(MODULE_OF_FLAG[k]).toMatch(/^M(1[0-5]|[1-9])$/);
  });
});
