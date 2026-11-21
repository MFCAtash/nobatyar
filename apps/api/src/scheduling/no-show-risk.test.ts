import { describe, expect, it } from "vitest";
import { scoreNoShow } from "./no-show-risk";

describe("scoreNoShow", () => {
  it("پایینترین ریسک برای ویزیت حضوری معمولی بدون سابقه", () => {
    const r = scoreNoShow({ priorNoShows: 0, leadDays: 5, hourTehran: 10, kind: "IN_PERSON" });
    expect(r.score).toBe(8);
    expect(r.reasons).toEqual(["پایه"]);
  });
  it("سابقه غیبت و ویزیت آنلاین ریسک را بالا میبرند", () => {
    const r = scoreNoShow({ priorNoShows: 2, leadDays: 1, hourTehran: 19, kind: "VIDEO" });
    expect(r.score).toBeGreaterThan(70);
    expect(r.reasons.join(" ")).toContain("سابقه غیبت");
    expect(r.score).toBeLessThanOrEqual(100);
  });
  it("همیشه در بازه ۰–۱۰۰ است", () => {
    for (const n of [0, 1, 5, 20]) {
      const r = scoreNoShow({ priorNoShows: n, leadDays: 0, hourTehran: 2, kind: "CHAT" });
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });
});
