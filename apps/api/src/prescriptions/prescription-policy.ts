import { normalizeText } from "../health-profile/health-profile";

/**
 * سیاست نسخه‌نویسی — توابع خالص.
 *  - فقط پزشک همان نوبت، در IN_PROGRESS/COMPLETED (پنجره‌ی پس از پایان محدود).
 *  - اعتبار نسخه: پیش‌فرض ۳۰ روز، حداکثر ۹۰.
 *  - بررسی حساسیت دارویی (heuristic) با پروفایل سلامت: هشدار ⇒ ثبت فقط با تأیید صریح پزشک (acknowledge).
 *  - نسخه‌ی صادرشده تغییرناپذیر است (تریگر DB)؛ اصلاح = ابطال + صدور مجدد.
 * ⚠️ این ماژول جایگزین سامانه‌ی ملی نسخه‌ی الکترونیک نیست (اتصال به آن خارج از این فاز است).
 */
export const RX_FORMS = ["TABLET", "CAPSULE", "SYRUP", "INJECTION", "DROP", "CREAM", "OINTMENT", "INHALER", "SPRAY", "SUPPOSITORY", "OTHER"] as const;
export const RX_LIMITS = { items: 10, drugName: 120, strength: 40, dose: 60, frequency: 60, instructions: 300, durationDaysMax: 365, quantityMax: 999, cancelReasonMin: 5, cancelReasonMax: 300 } as const;

export interface RxItem {
  drugName: string; form?: (typeof RX_FORMS)[number]; strength?: string;
  dose: string; frequency: string; durationDays: number; quantity: number; instructions?: string;
}

/** گروه‌های دارویی برای هشدار حساسیت متقاطع (فهرست کوتاه و عمداً غیرجامع). */
const CLASSES: { key: string; labelFa: string; names: string[] }[] = [
  { key: "penicillins", labelFa: "خانواده‌ی پنی‌سیلین", names: ["penicillin", "پنی‌سیلین", "amoxicillin", "آموکسی‌سیلین", "ampicillin", "آمپی‌سیلین", "augmentin", "آگمنتین", "amoxiclav", "cloxacillin", "کلوکساسیلین", "dicloxacillin", "piperacillin", "amoxil", "novamox", "moxypen", "amoxiclav", "آموکسیل", "augmentin", "flucloxacillin"] },
  { key: "cephalosporins", labelFa: "سفالوسپورین‌ها", names: ["cephalexin", "cefalexin", "سفالکسین", "cefixime", "سفیکسیم", "ceftriaxone", "سفتریاکسون", "cefazolin", "سفازولین", "cefuroxime", "سفوروکسیم", "cefpodoxime", "keflex", "rocephin", "suprax", "zinnat", "کفلکس", "سوپراکس", "سفیکسیم", "cefdinir", "cefprozil", "cefaclor"] },
  { key: "sulfonamides", labelFa: "سولفونامیدها", names: ["sulfa", "سولفا", "sulfamethoxazole", "cotrimoxazole", "کوتریموکسازول", "trimethoprim", "تریمتوپریم", "bactrim", "septrin", "septra", "باکتریم", "furosemide", "فوروزماید", "lasix", "لازیکس", "hydrochlorothiazide", "هیدروکلروتیازید", "glibenclamide", "گلی‌بن‌کلامید", "acetazolamide", "استازولامید", "sulfasalazine", "سولفاسالازین"] },
  { key: "nsaids", labelFa: "ضدالتهاب‌های غیراستروئیدی (NSAID)", names: ["nsaid", "ibuprofen", "ایبوپروفن", "naproxen", "ناپروکسن", "diclofenac", "دیکلوفناک", "aspirin", "آسپرین", "ketorolac", "کتورولاک", "celecoxib", "سلکوکسیب", "mefenamic", "مفنامیک", "piroxicam", "پیروکسیکام", "indomethacin", "brufen", "advil", "motrin", "بروفن", "ادویل", "voltaren", "cataflam", "ولتارن", "naprosyn", "apranax", "ناپروکسن", "ponstan", "پونستان", "ketoprofen", "کتوپروفن", "meloxicam", "ملوکسیکام", "etoricoxib"] },
  { key: "macrolides", labelFa: "ماکرولیدها", names: ["erythromycin", "اریترومایسین", "azithromycin", "آزیترومایسین", "clarithromycin", "کلاریترومایسین", "zithromax", "زیترومکس", "clarithro", "biaxin"] },
  { key: "opioids", labelFa: "اپیوئیدها", names: ["opioid", "اپیوئید", "morphine", "مورفین", "codeine", "کدئین", "tramadol", "ترامادول", "methadone", "متادون", "fentanyl", "فنتانیل", "oxycodone", "اکسی‌کدون", "hydrocodone", "pethidine", "پتیدین", "opium", "تریاک"] },
  { key: "quinolones", labelFa: "کینولون‌ها", names: ["ciprofloxacin", "سیپروفلوکساسین", "levofloxacin", "لووفلوکساسین", "ofloxacin", "اوفلوکساسین", "cipro", "سیپرو", "moxifloxacin", "موکسی‌فلوکساسین", "norfloxacin", "نورفلوکساسین"] },
];
const NORM_CLASSES = CLASSES.map((c) => ({ ...c, norm: c.names.map(normalizeText) }));

const classesOf = (text: string): Set<string> => {
  const n = normalizeText(text);
  const out = new Set<string>();
  if (n.length < 3) return out;
  for (const c of NORM_CLASSES) if (c.norm.some((x) => n.includes(x) || (n.length >= 4 && x.includes(n)))) out.add(c.key);
  return out;
};

/** جفت‌گروه‌هایی که واکنش متقاطع ممکن (نه قطعی) دارند. */
const CROSS: [string, string][] = [["penicillins", "cephalosporins"]];
export const ALLERGY_CHECK_NOTE_FA = "بررسی خودکار حساسیت فقط چند گروه دارویی و نام‌های رایج را می‌شناسد؛ نبودن هشدار به معنای ایمن‌بودن نیست و جایگزین بررسی پزشک نیست.";

export interface AllergyWarning { drugName: string; allergen: string; reasonFa: string }

export function checkAllergies(items: Pick<RxItem, "drugName">[], allergies: string[]): AllergyWarning[] {
  const out: AllergyWarning[] = [];
  for (const it of items) {
    const dn = normalizeText(it.drugName);
    const dClasses = classesOf(it.drugName);
    for (const a of allergies) {
      const an = normalizeText(a);
      if (an.length < 3) continue;
      if (dn.includes(an)) { out.push({ drugName: it.drugName, allergen: a, reasonFa: "نام دارو با حساسیت ثبت‌شده‌ی بیمار مطابقت دارد." }); continue; }
      const shared = [...classesOf(a)].filter((k) => dClasses.has(k));
      if (shared.length) {
        const label = CLASSES.find((c) => c.key === shared[0])!.labelFa;
        out.push({ drugName: it.drugName, allergen: a, reasonFa: `هم‌گروه با حساسیت ثبت‌شده (${label}).` });
        continue;
      }
      const aClasses = classesOf(a);
      const cross = CROSS.find(([x, y]) => (aClasses.has(x) && dClasses.has(y)) || (aClasses.has(y) && dClasses.has(x)));
      if (cross) out.push({ drugName: it.drugName, allergen: a, reasonFa: "احتمال واکنش متقاطع بین گروه‌های دارویی؛ با احتیاط و پس از پرسش از بیمار." });
    }
  }
  return out;
}

export function itemErrors(items: RxItem[]): string[] {
  const e: string[] = [];
  if (items.length < 1) e.push("no_items");
  if (items.length > RX_LIMITS.items) e.push("too_many_items");
  const seen = new Set<string>();
  items.forEach((it, i) => {
    const k = normalizeText(it.drugName);
    if (!k) e.push(`drug_name_required:${i}`);
    if (seen.has(k)) e.push(`duplicate_item:${i}`);
    seen.add(k);
    if (!Number.isInteger(it.durationDays) || it.durationDays < 1 || it.durationDays > RX_LIMITS.durationDaysMax) e.push(`duration_invalid:${i}`);
    if (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > RX_LIMITS.quantityMax) e.push(`quantity_invalid:${i}`);
    if (!it.dose.trim() || !it.frequency.trim()) e.push(`dose_frequency_required:${i}`);
  });
  return e;
}

export interface IssueFacts {
  appointmentStatus: string; endsAt: Date; userId: string; doctorId: string;
  items: RxItem[]; allergies: string[]; acknowledgedWarnings: boolean; validDays?: number;
}
export type IssueError = "not_participant" | "invalid_state" | "window_closed" | "invalid_items" | "invalid_validity" | "allergy_warning";
export type IssuePlan =
  | { ok: true; validUntil: Date; warnings: AllergyWarning[] }
  | { ok: false; error: IssueError; details?: string[]; warnings?: AllergyWarning[] };
export const DEFAULT_RX_CONFIG = { issueWindowDays: 7, defaultValidDays: 30, maxValidDays: 90 };

export function planIssue(f: IssueFacts, now: Date, cfg = DEFAULT_RX_CONFIG): IssuePlan {
  if (f.userId !== f.doctorId) return { ok: false, error: "not_participant" };
  if (f.appointmentStatus !== "IN_PROGRESS" && f.appointmentStatus !== "COMPLETED") return { ok: false, error: "invalid_state" };
  if (f.appointmentStatus === "COMPLETED" && now.getTime() > f.endsAt.getTime() + cfg.issueWindowDays * 86_400_000) return { ok: false, error: "window_closed" };
  const ie = itemErrors(f.items);
  if (ie.length) return { ok: false, error: "invalid_items", details: ie };
  const days = f.validDays ?? cfg.defaultValidDays;
  if (!Number.isInteger(days) || days < 1 || days > cfg.maxValidDays) return { ok: false, error: "invalid_validity" };
  const warnings = checkAllergies(f.items, f.allergies);
  if (warnings.length && !f.acknowledgedWarnings) return { ok: false, error: "allergy_warning", warnings };
  return { ok: true, validUntil: new Date(now.getTime() + days * 86_400_000), warnings };
}

export type RxStatus = "ISSUED" | "CANCELLED";
export type RxView = "ACTIVE" | "EXPIRED" | "CANCELLED";
export const rxView = (status: RxStatus, validUntil: Date, now: Date): RxView =>
  status === "CANCELLED" ? "CANCELLED" : now.getTime() >= validUntil.getTime() ? "EXPIRED" : "ACTIVE";

export function planCancel(f: { status: RxStatus; userId: string; doctorId: string; reason: string }): { ok: true } | { ok: false; error: "not_participant" | "already_cancelled" | "reason_required" } {
  if (f.userId !== f.doctorId) return { ok: false, error: "not_participant" };
  if (f.status === "CANCELLED") return { ok: false, error: "already_cancelled" };
  const r = f.reason.trim().length;
  if (r < RX_LIMITS.cancelReasonMin) return { ok: false, error: "reason_required" };
  return { ok: true };
}

/** شماره‌ی نسخه از بایت‌های تصادفی: NV-XXXX-XXXX (الفبای بدون حروف/ارقام مبهم). یکتایی را DB اجبار می‌کند. */
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
export function rxNumberFromBytes(bytes: Uint8Array): string {
  if (bytes.length < 8) throw new Error("need at least 8 random bytes");
  const c = Array.from(bytes.slice(0, 8), (b) => ALPHABET[b % ALPHABET.length]);
  return `NV-${c.slice(0, 4).join("")}-${c.slice(4).join("")}`;
}
export const RX_NUMBER_RE = /^NV-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
