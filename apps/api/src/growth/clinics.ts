/**
 * M14 — اکوسیستم کلینیک/سازمان (منطق خالص).
 *
 * فاصله با haversine محاسبه می‌شود؛ ترتیب نتایج پایدار (فاصله، سپس نام) است
 * تا UI و تست‌ها قطعی بمانند. هیچ آدرس/تلفن خامی در این لایه پردازش نمی‌شود.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface ClinicLike {
  id: string;
  name: string;
  addressFa: string;
  phone: string;
  geoLat: number | null;
  geoLng: number | null;
  verified: boolean;
}

const EARTH_RADIUS_KM = 6371.0088;

export function isValidLat(v: number): boolean {
  return Number.isFinite(v) && v >= -90 && v <= 90;
}

export function isValidLng(v: number): boolean {
  return Number.isFinite(v) && v >= -180 && v <= 180;
}

const toRad = (d: number) => (d * Math.PI) / 180;

/** فاصلهٔ دایرهٔ عظیمه به کیلومتر؛ ورودی نامعتبر ⇒ NaN (به‌جای عدد ساختگی). */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  if (!isValidLat(a.lat) || !isValidLng(a.lng) || !isValidLat(b.lat) || !isValidLng(b.lng)) return Number.NaN;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s))) * 100) / 100;
}

export interface RankedClinic extends ClinicLike {
  distanceKm: number | null;
}

export interface RankOptions {
  origin?: GeoPoint | null;
  maxKm?: number;
  query?: string;
  /** فقط کلینیک‌های تأییدشده (پیش‌فرض بیمار: true). */
  verifiedOnly?: boolean;
  limit?: number;
}

/**
 * رتبه‌بندی: تأییدشده‌ها اول، سپس فاصله (ناشناخته آخر)، سپس نام.
 * جست‌وجوی متنی روی نام/آدرس، نرمال‌شده و بدون حساسیت به فاصله.
 */
export function rankClinics(clinics: ClinicLike[], opts: RankOptions = {}): RankedClinic[] {
  const q = (opts.query ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const maxKm = opts.maxKm ?? Number.POSITIVE_INFINITY;
  const verifiedOnly = opts.verifiedOnly ?? false;

  const rows: RankedClinic[] = [];
  for (const c of clinics) {
    if (verifiedOnly && !c.verified) continue;
    if (q) {
      const hay = `${c.name} ${c.addressFa}`.toLowerCase().replace(/\s+/g, " ");
      if (!hay.includes(q)) continue;
    }
    const distanceKm =
      opts.origin && c.geoLat !== null && c.geoLng !== null
        ? haversineKm(opts.origin, { lat: c.geoLat, lng: c.geoLng })
        : null;
    if (distanceKm !== null && !(distanceKm <= maxKm)) continue;
    rows.push({ ...c, distanceKm });
  }

  rows.sort((a, b) => {
    if (a.verified !== b.verified) return a.verified ? -1 : 1;
    if (a.distanceKm !== null && b.distanceKm !== null && a.distanceKm !== b.distanceKm) {
      return a.distanceKm - b.distanceKm;
    }
    if (a.distanceKm === null && b.distanceKm !== null) return 1;
    if (a.distanceKm !== null && b.distanceKm === null) return -1;
    return a.name.localeCompare(b.name, "fa");
  });

  return rows.slice(0, Math.min(Math.max(opts.limit ?? 50, 1), 200));
}

// ─── سازمان ───────────────────────────────────────────────────────────────

export interface OrganizationPlanLike {
  id: string;
  name: string;
  seats: number;
  active: boolean;
}

export interface SeatAllocation {
  planId: string;
  usedSeats: number;
}

export type SeatCheck =
  | { ok: true; remaining: number }
  | { ok: false; error: "plan_inactive" | "plan_not_found" | "invalid_usage" | "over_capacity" };

/** بررسی ظرفیت: استفادهٔ منفی/بیش از ظرفیت رد می‌شود. */
export function checkSeats(plans: OrganizationPlanLike[], alloc: SeatAllocation): SeatCheck {
  const plan = plans.find((p) => p.id === alloc.planId);
  if (!plan) return { ok: false, error: "plan_not_found" };
  if (!plan.active) return { ok: false, error: "plan_inactive" };
  if (!Number.isInteger(alloc.usedSeats) || alloc.usedSeats < 0) return { ok: false, error: "invalid_usage" };
  const remaining = plan.seats - alloc.usedSeats;
  if (remaining < 0) return { ok: false, error: "over_capacity" };
  return { ok: true, remaining };
}

export const WORKSPACE_DASHBOARDS = ["CLINIC", "TELEHEALTH", "RESEARCH"] as const;
export type WorkspaceDashboard = (typeof WORKSPACE_DASHBOARDS)[number];

export function normalizeWorkspace(dashboard: string | null | undefined): WorkspaceDashboard {
  return (WORKSPACE_DASHBOARDS as readonly string[]).includes(dashboard ?? "")
    ? (dashboard as WorkspaceDashboard)
    : "TELEHEALTH";
}
