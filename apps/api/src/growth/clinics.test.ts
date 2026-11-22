import { describe, expect, it } from "vitest";
import {
  checkSeats,
  haversineKm,
  isValidLat,
  isValidLng,
  normalizeWorkspace,
  rankClinics,
  type ClinicLike,
} from "./clinics";

const clinic = (over: Partial<ClinicLike>): ClinicLike => ({
  id: over.id ?? "c1",
  name: over.name ?? "کلینیک",
  addressFa: over.addressFa ?? "تهران",
  phone: over.phone ?? "02100000000",
  geoLat: over.geoLat ?? null,
  geoLng: over.geoLng ?? null,
  verified: over.verified ?? true,
});

describe("M14 growth — geo", () => {
  it("validates coordinates", () => {
    expect(isValidLat(35.7)).toBe(true);
    expect(isValidLat(91)).toBe(false);
    expect(isValidLng(-180)).toBe(true);
    expect(isValidLng(180.1)).toBe(false);
  });

  it("computes known distances approximately", () => {
    const tehran = { lat: 35.6892, lng: 51.389 };
    const isfahan = { lat: 32.6546, lng: 51.668 };
    const d = haversineKm(tehran, isfahan);
    expect(d).toBeGreaterThan(330);
    expect(d).toBeLessThan(350);
    expect(haversineKm(tehran, tehran)).toBe(0);
    expect(Number.isNaN(haversineKm({ lat: 100, lng: 0 }, tehran))).toBe(true);
  });
});

describe("M14 growth — ranking", () => {
  const origin = { lat: 35.6892, lng: 51.389 };
  const rows = [
    clinic({ id: "far", name: "دور", geoLat: 32.65, geoLng: 51.66 }),
    clinic({ id: "near", name: "نزدیک", geoLat: 35.7, geoLng: 51.4 }),
    clinic({ id: "unverified", name: "تأییدنشده", geoLat: 35.69, geoLng: 51.39, verified: false }),
    clinic({ id: "nogeo", name: "بی‌موقعیت" }),
  ];

  it("sorts verified first then by distance and keeps unknown last", () => {
    const out = rankClinics(rows, { origin });
    expect(out.map((c) => c.id)).toEqual(["near", "far", "nogeo", "unverified"]);
    expect(out[0].distanceKm).toBeLessThan(out[1].distanceKm!);
  });

  it("filters by max distance and verified-only", () => {
    expect(rankClinics(rows, { origin, maxKm: 5 }).map((c) => c.id)).toEqual(["near", "nogeo", "unverified"]);
    expect(rankClinics(rows, { origin, verifiedOnly: true }).map((c) => c.id)).toEqual(["near", "far", "nogeo"]);
  });

  it("searches name/address case-insensitively and caps limit", () => {
    expect(rankClinics(rows, { query: "  نزدیک " }).map((c) => c.id)).toEqual(["near"]);
    expect(rankClinics(rows, { limit: 2 })).toHaveLength(2);
  });
});

describe("M14 growth — organization seats", () => {
  const plans = [
    { id: "p1", name: "پایه", seats: 10, active: true },
    { id: "p2", name: "غیرفعال", seats: 5, active: false },
  ];

  it("checks capacity and usage validity", () => {
    expect(checkSeats(plans, { planId: "p1", usedSeats: 4 })).toEqual({ ok: true, remaining: 6 });
    expect(checkSeats(plans, { planId: "p1", usedSeats: 10 })).toEqual({ ok: true, remaining: 0 });
    expect(checkSeats(plans, { planId: "p1", usedSeats: 11 })).toEqual({ ok: false, error: "over_capacity" });
    expect(checkSeats(plans, { planId: "p1", usedSeats: -1 })).toEqual({ ok: false, error: "invalid_usage" });
    expect(checkSeats(plans, { planId: "p2", usedSeats: 1 })).toEqual({ ok: false, error: "plan_inactive" });
    expect(checkSeats(plans, { planId: "x", usedSeats: 1 })).toEqual({ ok: false, error: "plan_not_found" });
  });

  it("normalizes workspace dashboard", () => {
    expect(normalizeWorkspace("CLINIC")).toBe("CLINIC");
    expect(normalizeWorkspace("junk")).toBe("TELEHEALTH");
    expect(normalizeWorkspace(null)).toBe("TELEHEALTH");
  });
});
