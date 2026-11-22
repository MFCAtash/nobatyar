/**
 * M9 — بازسازی داروها و هشدارهای غیرتشخیصی.
 *
 * این جدول صرفاً «هشدار برای بررسی توسط پزشک» است و هیچ توصیهٔ درمانی نمی‌دهد.
 */

export interface MedicationItem {
  name: string;
  dose?: string;
  note?: string;
}

export interface InteractionWarning {
  a: string;
  b: string;
  severity: "info" | "attention";
  messageFa: string;
}

const INTERACTIONS: Array<[string, string, "info" | "attention", string]> = [
  ["warfarin", "aspirin", "attention", "افزایش احتمال خون‌ریزی؛ نیازمند بازبینی پزشک"],
  ["warfarin", "ibuprofen", "attention", "افزایش احتمال خون‌ریزی گوارشی؛ نیازمند بازبینی پزشک"],
  ["metformin", "contrast", "attention", "در صورت تجویز مادهٔ حاجب، عملکرد کلیه باید بازبینی شود"],
  ["ssri", "tramadol", "attention", "احتمال سندرم سروتونین؛ نیازمند بازبینی پزشک"],
  ["acei", "spironolactone", "info", "پایش پتاسیم توصیه می‌شود"],
  ["statin", "gemfibrozil", "attention", "افزایش احتمال آسیب عضلانی؛ نیازمند بازبینی پزشک"],
];

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function normalizeItems(items: MedicationItem[]): MedicationItem[] {
  const seen = new Set<string>();
  const out: MedicationItem[] = [];
  for (const it of items) {
    const name = String(it?.name ?? "").trim().slice(0, 120);
    if (name.length < 2) continue;
    const key = normalize(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      dose: it.dose ? String(it.dose).trim().slice(0, 60) : undefined,
      note: it.note ? String(it.note).trim().slice(0, 200) : undefined,
    });
    if (out.length >= 50) break;
  }
  return out;
}

export function findInteractions(items: MedicationItem[]): InteractionWarning[] {
  const names = items.map((i) => normalize(i.name));
  const out: InteractionWarning[] = [];
  for (const [a, b, severity, messageFa] of INTERACTIONS) {
    if (names.some((n) => n.includes(a)) && names.some((n) => n.includes(b))) {
      out.push({ a, b, severity, messageFa });
    }
  }
  return out;
}

export interface ReconcileResult {
  items: MedicationItem[];
  warnings: InteractionWarning[];
  /** مواردی که در لیست قبلی بودند ولی در گزارش جدید نیستند (برای تأیید پزشک). */
  missingFromReport: string[];
}

export function reconcile(previous: MedicationItem[], reported: MedicationItem[]): ReconcileResult {
  const items = normalizeItems(reported);
  const prev = normalizeItems(previous);
  const names = new Set(items.map((i) => normalize(i.name)));
  return {
    items,
    warnings: findInteractions(items),
    missingFromReport: prev.filter((p) => !names.has(normalize(p.name))).map((p) => p.name),
  };
}
