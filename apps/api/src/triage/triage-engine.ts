import {
  ALL_FLAG_IDS, COMPLAINT_BY_CODE, EMERGENCY_CONTACTS, FLAG_BY_ID, GLOBAL_RED_FLAGS, TRIAGE_ENGINE_VERSION,
  URGENCY_BY_RANK, URGENCY_RANK, Urgency, maxUrgency,
} from "./triage-catalog";

/**
 * موتور triage — تابع خالص و قطعی (بدون I/O، بدون تصادف، بدون LLM).
 * قراردادهای ایمنی (با تست‌های ویژگی‌محور قفل شده‌اند):
 *  ۱) هر پرچم EMERGENCY ⇒ نتیجه EMERGENCY.
 *  ۲) افزودن پاسخ/علامت «هرگز» فوریت را کم نمی‌کند (یکنواختی).
 *  ۳) افزونه‌ی هوشمند (mergeEnhancement) فقط می‌تواند فوریت را «بالا» ببرد.
 * این ابزار تشخیص نیست و جایگزین پزشک نیست؛ متن هشدار در همه‌ی نتیجه‌ها می‌آید.
 */
export interface SymptomInput { code: string; severity: 1 | 2 | 3; durationDays?: number }
export interface TriageInput {
  ageYears: number;
  sex?: "MALE" | "FEMALE";
  pregnant?: boolean;
  symptoms: SymptomInput[];
  /** شناسه‌ی پرچم‌های قرمزی که کاربر «بله» گفته است */
  redFlags: string[];
}

export type SuggestedKind = "NONE" | "VIDEO" | "IN_PERSON" | "EMERGENCY";

export interface TriageResult {
  engineVersion: string;
  urgency: Urgency;
  reasonsFa: string[];
  redFlagsHit: { id: string; textFa: string; level: Urgency }[];
  specialties: { slug: string; score: number }[];
  adviceFa: string[];
  suggestedKind: SuggestedKind;
  emergencyContacts: readonly { number: string; labelFa: string }[];
  disclaimerFa: string;
}

export const DISCLAIMER_FA =
  "این ابزار فقط راهنمای اولیه است و تشخیص یا جایگزین ویزیت پزشک نیست. اگر نگران جان خود یا نزدیکانتان هستید، بدون تردید با اورژانس (۱۱۵) تماس بگیرید.";

export const MAX_SYMPTOMS = 3;

export function validateTriageInput(i: TriageInput): string[] {
  const e: string[] = [];
  if (!Number.isInteger(i.ageYears) || i.ageYears < 0 || i.ageYears > 120) e.push("age_invalid");
  if (i.pregnant && i.sex !== "FEMALE") e.push("pregnancy_requires_female");
  if (i.symptoms.length < 1) e.push("symptoms_required");
  if (i.symptoms.length > MAX_SYMPTOMS) e.push("too_many_symptoms");
  const seen = new Set<string>();
  for (const s of i.symptoms) {
    if (!COMPLAINT_BY_CODE.has(s.code)) e.push(`unknown_symptom:${s.code}`);
    if (seen.has(s.code)) e.push(`duplicate_symptom:${s.code}`);
    seen.add(s.code);
    if (![1, 2, 3].includes(s.severity)) e.push("severity_invalid");
    if (s.durationDays !== undefined && (!Number.isInteger(s.durationDays) || s.durationDays < 0 || s.durationDays > 3650)) e.push("duration_invalid");
  }
  for (const f of i.redFlags) if (!ALL_FLAG_IDS.has(f)) e.push(`unknown_flag:${f}`);
  return e;
}

/** پرچم‌های قرمزی که باید برای این ورودی پرسیده شود (مرحله‌ی دوم UI). */
export function applicableFlags(i: Pick<TriageInput, "ageYears" | "pregnant" | "symptoms">) {
  const fits = (f: { ageMax?: number; ageMin?: number; pregnantOnly?: boolean }) =>
    (f.ageMax === undefined || i.ageYears <= f.ageMax) && (f.ageMin === undefined || i.ageYears >= f.ageMin) && (!f.pregnantOnly || !!i.pregnant);
  const specific = i.symptoms.flatMap((s) => COMPLAINT_BY_CODE.get(s.code)?.redFlags ?? []);
  return { global: GLOBAL_RED_FLAGS.filter(fits), specific: specific.filter(fits) };
}

const bump = (u: Urgency): Urgency => URGENCY_BY_RANK[Math.min(URGENCY_RANK[u] + 1, URGENCY_RANK.URGENT)];

export const ADVICE: Record<Urgency, string[]> = {
  EMERGENCY: [
    "همین الان با اورژانس (۱۱۵) تماس بگیرید یا نزدیک‌ترین اورژانس بیمارستان بروید.",
    "تنها نمانید و خودتان رانندگی نکنید.",
    "منتظر نوبت آنلاین نمانید.",
  ],
  URGENT: [
    "همین امروز و ظرف چند ساعت توسط پزشک دیده شوید؛ ویزیت حضوری یا مراجعه به مرکز درمانی مناسب‌تر است.",
    "اگر وضعیت بدتر شد یا به پزشک دسترسی ندارید، به اورژانس مراجعه کنید.",
  ],
  SOON: ["ظرف ۱ تا ۳ روز آینده با پزشک ویزیت کنید.", "در صورت بدتر شدن علائم، زودتر مراجعه کنید."],
  ROUTINE: ["در یکی دو هفته‌ی آینده نوبت بگیرید؛ ویزیت تصویری معمولاً کافی است.", "اگر علامت تازه‌ای اضافه شد، دوباره ارزیابی کنید."],
  SELF_CARE: ["احتمالاً با مراقبت در منزل بهتر می‌شود.", "اگر علائم بیش از چند روز ادامه یافت یا بدتر شد، ویزیت کنید."],
};

const kindFor = (u: Urgency): SuggestedKind =>
  u === "EMERGENCY" ? "EMERGENCY" : u === "URGENT" ? "IN_PERSON" : u === "SELF_CARE" ? "NONE" : "VIDEO";

export function runTriage(i: TriageInput): TriageResult {
  const errors = validateTriageInput(i);
  if (errors.length) throw new Error(`invalid triage input: ${errors.join(",")}`);

  const reasons: string[] = [];
  const state: { urgency: Urgency } = { urgency: "SELF_CARE" }; // شیء، تا TS بعد از closure ها narrow نکند
  const raise = (u: Urgency, reason?: string) => {
    if (URGENCY_RANK[u] > URGENCY_RANK[state.urgency]) state.urgency = u;
    if (reason && !reasons.includes(reason)) reasons.push(reason);
  };

  const complaints = i.symptoms.map((s) => ({ s, c: COMPLAINT_BY_CODE.get(s.code)! }));
  for (const { c } of complaints) raise(c.baseUrgency);

  const hits: TriageResult["redFlagsHit"] = [];
  for (const id of new Set(i.redFlags)) {
    const f = FLAG_BY_ID.get(id)!;
    hits.push({ id, textFa: f.textFa, level: f.level });
    raise(f.level, `علامت هشدار: ${f.textFa}`);
  }

  // شدت: علامت «شدید» یک پله بالاتر (تا URGENT؛ EMERGENCY فقط از پرچم یا قاعده‌ی سنی می‌آید)
  if (complaints.some(({ s }) => s.severity === 3)) raise(bump(state.urgency), state.urgency === "EMERGENCY" ? undefined : "شدت علائم زیاد گزارش شده است.");
  if (complaints.some(({ s }) => (s.durationDays ?? 0) > 14)) raise("ROUTINE", "علائم بیش از ۱۴ روز ادامه داشته است.");
  if (complaints.length >= 3) raise("SOON", "چند علامت هم‌زمان وجود دارد.");

  for (const { c } of complaints) {
    for (const r of c.ageRules ?? []) {
      if ((r.minAge === undefined || i.ageYears >= r.minAge) && (r.maxAge === undefined || i.ageYears <= r.maxAge)) raise(r.minUrgency, r.reasonFa);
    }
    if (i.pregnant && c.pregnancyMin) raise(c.pregnancyMin, "علائم در دوران بارداری زودتر بررسی می‌شود.");
  }

  // تخصص‌ها: ترتیب ارتباط × شدت
  const score = new Map<string, number>();
  for (const { s, c } of complaints) c.specialties.forEach((slug, idx) => score.set(slug, (score.get(slug) ?? 0) + (c.specialties.length - idx) * s.severity));
  if (i.ageYears < 15) score.set("pediatrics", (score.get("pediatrics") ?? 0) + 8);
  if (i.pregnant) score.set("gynecology", (score.get("gynecology") ?? 0) + 6);
  const specialties = [...score.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([slug, sc]) => ({ slug, score: sc }));

  const urgency = state.urgency;
  const tips = urgency === "SELF_CARE" || urgency === "ROUTINE" ? complaints.flatMap(({ c }) => c.selfCareFa ?? []) : [];
  return {
    engineVersion: TRIAGE_ENGINE_VERSION,
    urgency,
    reasonsFa: reasons,
    redFlagsHit: hits,
    specialties,
    adviceFa: [...ADVICE[urgency], ...tips],
    suggestedKind: kindFor(urgency),
    emergencyContacts: urgency === "EMERGENCY" ? EMERGENCY_CONTACTS : [],
    disclaimerFa: DISCLAIMER_FA,
  };
}

/** خروجی یک افزونه‌ی هوشمند (مثلاً LLM) — فقط پیشنهاد؛ هرگز مرجع نهایی نیست. */
export interface Enhancement { urgency?: Urgency; notesFa?: string[]; specialties?: string[] }

/**
 * ادغام امن: فوریت فقط بالا می‌رود، یادداشت‌ها کوتاه و محدود می‌شوند، تخصص‌ها فقط از فهرست مجاز.
 * اگر روزی LLM اضافه شد، خروجی‌اش حتماً از این تابع عبور کند (و پیش از آن رضایت/قرارداد پردازش داده لازم است).
 */
export function mergeEnhancement(base: TriageResult, enh: Enhancement | null | undefined, knownSpecialties: ReadonlySet<string>): TriageResult {
  if (!enh) return base;
  const urgency = enh.urgency && enh.urgency in URGENCY_RANK ? maxUrgency(base.urgency, enh.urgency) : base.urgency;
  const raised = urgency !== base.urgency;
  const notes = (enh.notesFa ?? []).map((n) => String(n).trim().slice(0, 300)).filter(Boolean).slice(0, 5);
  const extra = (enh.specialties ?? []).filter((s) => knownSpecialties.has(s) && !base.specialties.some((b) => b.slug === s)).slice(0, 2);
  return {
    ...base,
    urgency,
    reasonsFa: [...base.reasonsFa, ...(raised ? ["ارزیابی تکمیلی فوریت را بالاتر دانست."] : []), ...notes],
    specialties: [...base.specialties, ...extra.map((slug) => ({ slug, score: 0 }))],
    adviceFa: raised ? [...ADVICE[urgency]] : base.adviceFa,
    suggestedKind: raised ? kindFor(urgency) : base.suggestedKind,
    emergencyContacts: urgency === "EMERGENCY" ? EMERGENCY_CONTACTS : base.emergencyContacts,
  };
}
