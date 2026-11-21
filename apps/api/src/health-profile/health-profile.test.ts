import { describe, expect, it } from "vitest";
import { EMPTY_PROFILE, HP_LIMITS, normalizeProfile, normalizeText } from "./health-profile";

describe("normalizeText", () => {
  it("فارسی/عربی/نیم‌فاصله/فاصله/حروف لاتین یکسان می‌شوند", () => {
    expect(normalizeText("پنی‌سیلین")).toBe(normalizeText("پنی سیلین"));
    expect(normalizeText("آموكسي سيلين")).toBe(normalizeText("آموکسی‌سیلین"));
    expect(normalizeText("Co-Trimoxazole 480")).toBe("cotrimoxazole480");
  });
});

describe("normalizeProfile", () => {
  it("null/ناقص ⇒ پروفایل خالی امن", () => {
    expect(normalizeProfile(null)).toEqual(EMPTY_PROFILE);
    expect(normalizeProfile({ allergies: "x" as never, bloodType: "Z+", pregnancy: "MAYBE" })).toEqual(EMPTY_PROFILE);
  });
  it("تکراری‌ها (با تفاوت نیم‌فاصله/فاصله) حذف، آیتم‌ها trim و محدود می‌شوند", () => {
    const p = normalizeProfile({ allergies: ["پنی‌سیلین", " پنی سیلین ", "", 5 as never, "x".repeat(200)], medications: Array.from({ length: 50 }, (_, i) => `drug${i}`) });
    expect(p.allergies).toHaveLength(2);
    expect(p.allergies[1]).toHaveLength(HP_LIMITS.itemLen);
    expect(p.medications).toHaveLength(HP_LIMITS.items);
  });
  it("گروه خون و بارداری معتبر پذیرفته می‌شوند؛ یادداشت محدود", () => {
    const p = normalizeProfile({ bloodType: "O-", pregnancy: "YES", notes: "  " + "n".repeat(2000) });
    expect(p.bloodType).toBe("O-"); expect(p.pregnancy).toBe("YES"); expect(p.notes).toHaveLength(HP_LIMITS.notes);
  });
});
