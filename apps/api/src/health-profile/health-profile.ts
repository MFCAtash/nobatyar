/**
 * پروفایل سلامت بیمار (حساسیت‌ها، بیماری‌های زمینه‌ای، داروهای مصرفی) — منطق خالص.
 * HEALTH: در DB فقط به‌صورت JSON رمزنگاری‌شده ذخیره می‌شود.
 */
export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
export const PREGNANCY = ["NO", "YES", "UNKNOWN"] as const;
export const HP_LIMITS = { items: 30, itemLen: 80, notes: 1000 } as const;

export interface HealthProfile {
  allergies: string[]; chronicConditions: string[]; medications: string[];
  bloodType: (typeof BLOOD_TYPES)[number] | null; pregnancy: (typeof PREGNANCY)[number]; notes: string;
}
export const EMPTY_PROFILE: HealthProfile = { allergies: [], chronicConditions: [], medications: [], bloodType: null, pregnancy: "UNKNOWN", notes: "" };

/** یکسان‌سازی متن فارسی/عربی/لاتین برای مقایسه (حذف فاصله، نیم‌فاصله، علائم؛ ي→ی، ك→ک). */
export function normalizeText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[ةۀ]/g, "ه")
    .replace(/[\u064B-\u065F\u0640\u200c\u200d\u200e\u200f]/g, "")
    .toLowerCase()
    .replace(/[\s\-_.,،;:/\\()]+/g, "");
}

const list = (v: unknown): string[] => {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>(); const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string") continue;
    const t = x.trim().slice(0, HP_LIMITS.itemLen);
    const k = normalizeText(t);
    if (!k || seen.has(k)) continue;
    seen.add(k); out.push(t);
    if (out.length >= HP_LIMITS.items) break;
  }
  return out;
};

export function normalizeProfile(raw: Partial<Record<keyof HealthProfile, unknown>> | null | undefined): HealthProfile {
  const r = raw ?? {};
  return {
    allergies: list(r.allergies), chronicConditions: list(r.chronicConditions), medications: list(r.medications),
    bloodType: (BLOOD_TYPES as readonly unknown[]).includes(r.bloodType) ? (r.bloodType as HealthProfile["bloodType"]) : null,
    pregnancy: (PREGNANCY as readonly unknown[]).includes(r.pregnancy) ? (r.pregnancy as HealthProfile["pregnancy"]) : "UNKNOWN",
    notes: typeof r.notes === "string" ? r.notes.trim().slice(0, HP_LIMITS.notes) : "",
  };
}
