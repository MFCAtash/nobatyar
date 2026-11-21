import { describe, expect, it } from "vitest";
import { classifyVital, trend, validateVital } from "./vitals-policy";

describe("validateVital", () => {
  it("فشار خون: diastolic الزامی و کوچکتر از systolic", () => {
    expect(validateVital("BLOOD_PRESSURE", 120, null)).toContain("diastolic_required");
    expect(validateVital("BLOOD_PRESSURE", 120, 130)).toContain("diastolic_must_be_below_systolic");
    expect(validateVital("BLOOD_PRESSURE", 120, 80)).toEqual([]);
    expect(validateVital("BLOOD_PRESSURE", 500, 80)).toContain("value_primary_out_of_range_50_300");
  });
  it("سایر انواع secondary ندارند", () => {
    expect(validateVital("WEIGHT", 75, null)).toEqual([]);
    expect(validateVital("WEIGHT", 75, 3)).toContain("secondary_not_allowed");
    expect(validateVital("OXYGEN_SATURATION", 98, null)).toEqual([]);
  });
});

describe("classifyVital", () => {
  it("فشار خون", () => {
    expect(classifyVital("BLOOD_PRESSURE", 120, 80)).toBe("normal");
    expect(classifyVital("BLOOD_PRESSURE", 145, 92)).toBe("watch");
    expect(classifyVital("BLOOD_PRESSURE", 185, 95)).toBe("alert");
    expect(classifyVital("BLOOD_PRESSURE", 110, 125)).toBe("alert");
  });
  it("قند، ضربان، دما و اکسیژن", () => {
    expect(classifyVital("BLOOD_GLUCOSE", 110, null)).toBe("normal");
    expect(classifyVital("BLOOD_GLUCOSE", 200, null)).toBe("watch");
    expect(classifyVital("BLOOD_GLUCOSE", 300, null)).toBe("alert");
    expect(classifyVital("HEART_RATE", 140, null)).toBe("alert");
    expect(classifyVital("BODY_TEMPERATURE", 38, null)).toBe("watch");
    expect(classifyVital("OXYGEN_SATURATION", 88, null)).toBe("alert");
  });
});

describe("trend", () => {
  it("جهت و میانگین تغییر", () => {
    expect(trend([70, 71, 73, 74])).toEqual({ direction: "up", deltaPerReading: 1.33 });
    expect(trend([80, 78, 75])).toEqual({ direction: "down", deltaPerReading: -2.5 });
    expect(trend([70])).toEqual({ direction: "flat", deltaPerReading: 0 });
    expect(trend([70, 70.1])).toEqual({ direction: "flat", deltaPerReading: 0.1 });
  });
});
