/**
 * M10 — حاکمیت قواعد triage (منطق خالص و قابل بازبینی بالینی).
 *
 * قواعد باید «قابل توضیح» باشند: هر قاعده دلیل فارسی و منبع دارد و هیچ‌جا
 * ادعای تشخیص قطعی نمی‌شود. نبود قاعدهٔ اورژانسی ⇒ ruleset نامعتبر است (fail-closed).
 */

export type TriageLevel = "EMERGENCY" | "URGENT" | "ROUTINE";

export interface TriageRule {
  id: string;
  /** هر یک از این نشانه‌ها (OR) کافی است. */
  anyOf: string[];
  level: TriageLevel;
  explanationFa: string;
}

export interface RuleSet {
  version: string;
  rules: TriageRule[];
  /** مرجع تصویب بالینی (متن آزاد کوتاه، بدون PHI). */
  approvedByLabel: string;
}

const FORBIDDEN_CLAIMS = ["تشخیص قطعی", "قطعاً", "بدون نیاز به پزشک", "درمان قطعی"];
const MAX_RULES = 100;

export function validateRuleSet(rs: RuleSet): string[] {
  const errors: string[] = [];
  if (!/^\d+\.\d+\.\d+$/.test(rs.version)) errors.push("version must be semver (x.y.z)");
  if (!Array.isArray(rs.rules) || rs.rules.length === 0) errors.push("rules must not be empty");
  if (rs.rules.length > MAX_RULES) errors.push(`too many rules (max ${MAX_RULES})`);
  if (!rs.approvedByLabel?.trim()) errors.push("approvedByLabel is required");

  const ids = new Set<string>();
  for (const r of rs.rules) {
    if (!r.id?.trim()) errors.push("rule id is required");
    if (ids.has(r.id)) errors.push(`duplicate rule id: ${r.id}`);
    ids.add(r.id);
    if (!Array.isArray(r.anyOf) || r.anyOf.filter((s) => s?.trim()).length === 0) {
      errors.push(`rule ${r.id}: anyOf must have at least one symptom`);
    }
    if (!["EMERGENCY", "URGENT", "ROUTINE"].includes(r.level)) errors.push(`rule ${r.id}: invalid level`);
    if (!r.explanationFa || r.explanationFa.trim().length < 10) {
      errors.push(`rule ${r.id}: explanationFa too short`);
    }
    for (const bad of FORBIDDEN_CLAIMS) {
      if (r.explanationFa?.includes(bad)) errors.push(`rule ${r.id}: forbidden claim '${bad}'`);
    }
  }
  if (!rs.rules.some((r) => r.level === "EMERGENCY")) errors.push("at least one EMERGENCY rule is required");
  return errors;
}

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export interface Evaluation {
  level: TriageLevel;
  matched: string[];
  explanationFa: string;
  /** همیشه نمایش داده می‌شود؛ triage جایگزین اورژانس نیست. */
  emergencyNoticeFa: string;
}

export const EMERGENCY_NOTICE_FA =
  "در موارد درد قفسهٔ سینه، تنگی نفس شدید، خون‌ریزی فعال یا کاهش هوشیاری فوراً با ۱۱۵ تماس بگیرید.";

const rank: Record<TriageLevel, number> = { ROUTINE: 0, URGENT: 1, EMERGENCY: 2 };

/**
 * ارزیابی قطعی: بالاترین سطحِ مطابق برنده است؛ خروجی همیشه «توضیح» و
 * فهرست نشانه‌های مطابق را برمی‌گرداند.
 */
export function evaluateRuleSet(rs: RuleSet, symptoms: string[]): Evaluation {
  const input = new Set(symptoms.map(normalize).filter(Boolean));
  let best: TriageLevel = "ROUTINE";
  const matched: string[] = [];
  const explanations: string[] = [];

  for (const r of rs.rules) {
    const hit = r.anyOf.some((s) => input.has(normalize(s)));
    if (!hit) continue;
    matched.push(r.id);
    if (rank[r.level] > rank[best]) {
      best = r.level;
      explanations.length = 0;
      explanations.push(r.explanationFa);
    } else if (rank[r.level] === rank[best] && explanations.length < 3) {
      explanations.push(r.explanationFa);
    }
  }

  return {
    level: best,
    matched,
    explanationFa: explanations.join(" ") || "نشانه‌های ثبت‌شده در قواعد اورژانسی نیست؛ در صورت تداوم با پزشک مشورت کنید.",
    emergencyNoticeFa: EMERGENCY_NOTICE_FA,
  };
}

/** مقایسهٔ نسخه: منفی/صفر/مثبت. */
export function compareVersion(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}
