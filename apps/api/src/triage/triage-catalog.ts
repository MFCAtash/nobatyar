/**
 * کاتالوگ triage — «داده»‌ی قواعد، جدا از منطق موتور.
 * ⚠️ این کاتالوگ تصمیم بالینی است: هر تغییر باید توسط مسئول بالینی بازبینی و `TRIAGE_ENGINE_VERSION` بالا برده شود.
 * اصل طراحی: در شک، سطح فوریت را «بالا» ببر؛ هرگز پایین نیاور.
 */
export type Urgency = "EMERGENCY" | "URGENT" | "SOON" | "ROUTINE" | "SELF_CARE";
export const URGENCY_RANK: Record<Urgency, number> = { SELF_CARE: 0, ROUTINE: 1, SOON: 2, URGENT: 3, EMERGENCY: 4 };
export const URGENCY_BY_RANK: Urgency[] = ["SELF_CARE", "ROUTINE", "SOON", "URGENT", "EMERGENCY"];
export const maxUrgency = (a: Urgency, b: Urgency): Urgency => (URGENCY_RANK[a] >= URGENCY_RANK[b] ? a : b);

export const TRIAGE_ENGINE_VERSION = "rules-1.0.0";

/** شماره‌های اضطراری — پیش از انتشار توسط تیم محصول/بالینی راستی‌آزمایی شود. */
export const EMERGENCY_CONTACTS = [
  { number: "115", labelFa: "اورژانس پزشکی" },
  { number: "123", labelFa: "اورژانس اجتماعی (بحران روانی و خشونت)" },
] as const;

export interface RedFlag {
  id: string;
  textFa: string;
  level: Exclude<Urgency, "SELF_CARE" | "ROUTINE">;
  /** فقط برای این بازه‌ی سنی/وضعیت پرسیده می‌شود (UI)؛ در موتور، هر پرچم انتخاب‌شده شمرده می‌شود. */
  ageMax?: number;
  ageMin?: number;
  pregnantOnly?: boolean;
}

export interface AgeRule { minAge?: number; maxAge?: number; minUrgency: Urgency; reasonFa: string }

export interface Complaint {
  code: string;
  labelFa: string;
  /** به ترتیب ارتباط؛ slug ها باید با جدول specialties هم‌خوان باشند (آنچه در DB نیست نادیده گرفته می‌شود). */
  specialties: string[];
  baseUrgency: Urgency;
  redFlags: RedFlag[];
  ageRules?: AgeRule[];
  /** حداقل فوریت در بارداری */
  pregnancyMin?: Urgency;
  selfCareFa?: string[];
}

/** پرچم‌های قرمز عمومی — برای هر شکایتی پرسیده می‌شوند. */
export const GLOBAL_RED_FLAGS: RedFlag[] = [
  { id: "g_unconscious", textFa: "از دست رفتن هوشیاری، گیجی یا بی‌پاسخی ناگهانی", level: "EMERGENCY" },
  { id: "g_breathing", textFa: "تنگی نفس شدید یا ناتوانی در گفتن یک جمله کامل", level: "EMERGENCY" },
  { id: "g_bleeding", textFa: "خونریزی شدید که با فشار قطع نمی‌شود", level: "EMERGENCY" },
  { id: "g_stroke", textFa: "کج‌شدن صورت، ضعف یا بی‌حسی ناگهانی یک سمت بدن، یا اختلال ناگهانی گفتار", level: "EMERGENCY" },
  { id: "g_seizure", textFa: "تشنج در حال انجام یا اولین تشنج در زندگی", level: "EMERGENCY" },
  { id: "g_allergy", textFa: "تورم لب/زبان/گلو همراه با سختی نفس‌کشیدن (واکنش حساسیتی شدید)", level: "EMERGENCY" },
  { id: "g_poison", textFa: "مصرف بیش از حد دارو، مواد یا مسمومیت", level: "EMERGENCY" },
  { id: "g_self_harm", textFa: "افکار جدی یا برنامه برای آسیب‌زدن به خود یا دیگران", level: "EMERGENCY" },
  { id: "g_child_lethargy", textFa: "کودک بی‌حال است و به‌سختی بیدار می‌شود یا واکنش نشان نمی‌دهد", level: "EMERGENCY", ageMax: 14 },
];

const F = (id: string, textFa: string, level: RedFlag["level"], extra: Partial<RedFlag> = {}): RedFlag => ({ id, textFa, level, ...extra });

export const COMPLAINTS: Complaint[] = [
  {
    code: "chest_pain", labelFa: "درد یا فشار قفسه سینه", specialties: ["cardiology", "internal", "general"], baseUrgency: "URGENT",
    redFlags: [
      F("cp_radiating", "درد فشارنده یا سنگین که به بازو، فک یا پشت کشیده می‌شود", "EMERGENCY"),
      F("cp_sweat", "همراه با تعریق سرد، تهوع یا تنگی نفس", "EMERGENCY"),
      F("cp_trauma", "درد پس از ضربه به قفسه سینه", "URGENT"),
    ],
    ageRules: [{ minAge: 65, minUrgency: "EMERGENCY", reasonFa: "درد قفسه سینه در سنین بالا باید فوراً بررسی شود." }],
    pregnancyMin: "URGENT",
  },
  {
    code: "shortness_of_breath", labelFa: "تنگی نفس", specialties: ["internal", "cardiology", "general"], baseUrgency: "URGENT",
    redFlags: [
      F("sb_cyanosis", "کبودی لب‌ها یا نوک انگشتان", "EMERGENCY"),
      F("sb_asthma", "سابقه آسم و دارو اثر نمی‌کند", "EMERGENCY"),
      F("sb_swelling", "تورم یک پا همراه با درد (احتمال لخته)", "URGENT"),
    ],
    pregnancyMin: "URGENT",
  },
  {
    code: "headache", labelFa: "سردرد", specialties: ["neurology", "general"], baseUrgency: "ROUTINE",
    redFlags: [
      F("ha_thunder", "ناگهانی‌ترین و شدیدترین سردرد عمر", "EMERGENCY"),
      F("ha_meningitis", "همراه با تب و سفتی گردن یا حساسیت شدید به نور", "EMERGENCY"),
      F("ha_vision", "همراه با تاری یا دوبینی ناگهانی", "URGENT"),
      F("ha_trauma", "سردرد پس از ضربه به سر", "URGENT"),
      F("ha_new_old", "سردرد جدید و متفاوت پس از ۵۰ سالگی", "URGENT"),
    ],
    pregnancyMin: "SOON",
  },
  {
    code: "fever", labelFa: "تب", specialties: ["general", "internal", "pediatrics"], baseUrgency: "ROUTINE",
    redFlags: [
      F("fv_purpura", "لکه‌های ارغوانی/بنفش روی پوست که با فشار سفید نمی‌شوند", "EMERGENCY"),
      F("fv_neck", "همراه با سفتی گردن یا حساسیت شدید به نور", "EMERGENCY"),
      F("fv_high", "تب بالای ۴۰ درجه یا تبی که با تب‌بر پایین نمی‌آید", "URGENT"),
      F("fv_immune", "ضعف سیستم ایمنی (شیمی‌درمانی، پیوند، مصرف داروی سرکوب‌کننده)", "URGENT"),
    ],
    ageRules: [
      { maxAge: 0, minUrgency: "URGENT", reasonFa: "تب در نوزاد و شیرخوار کوچک باید همان روز توسط پزشک دیده شود." },
      { minAge: 65, minUrgency: "SOON", reasonFa: "تب در سالمندان زودتر بررسی شود." },
    ],
    pregnancyMin: "SOON",
  },
  {
    code: "abdominal_pain", labelFa: "درد شکم", specialties: ["gastroenterology", "internal", "general"], baseUrgency: "SOON",
    redFlags: [
      F("ab_rigid", "درد شدید و ناگهانی با شکم سفت", "EMERGENCY"),
      F("ab_blood", "استفراغ خونی یا مدفوع سیاه/خونی", "EMERGENCY"),
      F("ab_rlq", "درد سمت راست پایین شکم همراه با تب", "URGENT"),
      F("ab_dehydration", "استفراغ مکرر و ناتوانی در نوشیدن مایعات", "URGENT"),
    ],
    pregnancyMin: "URGENT",
  },
  {
    code: "cough_cold", labelFa: "سرفه، سرماخوردگی", specialties: ["general", "internal", "ent"], baseUrgency: "SELF_CARE",
    redFlags: [F("cc_blood", "سرفه خونی", "URGENT"), F("cc_wheeze", "خس‌خس سینه یا نفس‌نفس‌زدن", "URGENT")],
    selfCareFa: ["مایعات گرم و استراحت کافی", "هوای اتاق را مرطوب نگه دارید"],
  },
  {
    code: "sore_throat_ear", labelFa: "گلودرد یا گوش‌درد", specialties: ["ent", "general"], baseUrgency: "SELF_CARE",
    redFlags: [
      F("st_swallow", "ناتوانی در بلع بزاق، باز‌نشدن دهان یا تورم گردن", "URGENT"),
      F("st_hearing", "افت ناگهانی شنوایی", "URGENT"),
    ],
    selfCareFa: ["مایعات گرم و غرغره آب‌نمک", "استراحت صوتی"],
  },
  {
    code: "skin_rash", labelFa: "بثورات یا مشکل پوستی", specialties: ["dermatology", "general"], baseUrgency: "ROUTINE",
    redFlags: [
      F("sk_purpura", "لکه‌های ارغوانی که با فشار سفید نمی‌شوند", "EMERGENCY"),
      F("sk_mucosa", "راش گسترده همراه با تب، یا تاول در دهان/چشم", "URGENT"),
      F("sk_infection", "قرمزی داغ و در حال گسترش همراه با درد و تب", "URGENT"),
    ],
  },
  {
    code: "back_joint_pain", labelFa: "کمردرد یا درد مفاصل و عضلات", specialties: ["orthopedics", "general"], baseUrgency: "ROUTINE",
    redFlags: [
      F("bj_cauda", "ضعف یا بی‌حسی پاها، یا بی‌اختیاری ادرار/مدفوع همراه با کمردرد", "EMERGENCY"),
      F("bj_trauma", "پس از سقوط یا تصادف و ناتوانی در حرکت دادن عضو", "URGENT"),
      F("bj_hot_joint", "مفصل ورم‌کرده، قرمز و داغ همراه با تب", "URGENT"),
    ],
    selfCareFa: ["استراحت نسبی و پرهیز از حرکات ناگهانی", "کمپرس گرم یا سرد"],
  },
  {
    code: "dizziness", labelFa: "سرگیجه یا غش", specialties: ["neurology", "ent", "general"], baseUrgency: "SOON",
    redFlags: [
      F("dz_chest", "همراه با درد قفسه سینه یا تپش قلب شدید", "EMERGENCY"),
      F("dz_faint", "غش‌کردن کامل", "URGENT"),
      F("dz_head", "پس از ضربه به سر", "URGENT"),
    ],
  },
  {
    code: "urinary", labelFa: "مشکل ادراری", specialties: ["urology", "general"], baseUrgency: "ROUTINE",
    redFlags: [
      F("ur_retention", "ناتوانی کامل در ادرارکردن", "URGENT"),
      F("ur_flank", "درد شدید پهلو همراه با تب و لرز", "URGENT"),
      F("ur_blood", "وجود خون در ادرار", "SOON"),
    ],
    pregnancyMin: "SOON",
  },
  {
    code: "mental_health", labelFa: "اضطراب، خلق پایین یا بی‌خوابی", specialties: ["psychiatry", "general"], baseUrgency: "ROUTINE",
    redFlags: [
      F("mh_passive", "افکار گاه‌به‌گاه مرگ یا احساس بی‌ارزشی شدید", "URGENT"),
      F("mh_panic", "حملات هراس مکرر با تپش قلب و ترس شدید", "SOON"),
    ],
  },
  {
    code: "pregnancy_gyn", labelFa: "مشکل زنان یا بارداری", specialties: ["gynecology", "general"], baseUrgency: "SOON",
    redFlags: [
      F("pg_bleed", "خونریزی واژینال شدید یا درد شدید شکم در بارداری", "EMERGENCY"),
      F("pg_movement", "کاهش یا قطع حرکات جنین", "URGENT"),
      F("pg_pressure", "سردرد شدید، تاری دید یا تورم ناگهانی صورت/دست‌ها در بارداری", "URGENT"),
    ],
  },
  {
    code: "eye_problem", labelFa: "مشکل چشم", specialties: ["ophthalmology", "general"], baseUrgency: "ROUTINE",
    redFlags: [
      F("ey_vision", "افت ناگهانی بینایی یا پرده‌ی تیره جلوی چشم", "EMERGENCY"),
      F("ey_chemical", "ورود مواد شیمیایی به چشم", "EMERGENCY"),
      F("ey_trauma", "ضربه یا جسم خارجی در چشم", "URGENT"),
    ],
  },
  {
    code: "diabetes_bp", labelFa: "قند یا فشار خون", specialties: ["endocrinology", "internal", "general"], baseUrgency: "ROUTINE",
    redFlags: [
      F("db_bp", "فشار خون بالای ۱۸۰/۱۲۰ همراه با سردرد، تاری دید یا درد قفسه سینه", "EMERGENCY"),
      F("db_sugar", "قند خون بالای ۳۰۰ همراه با تشنگی شدید، تنفس تند یا تهوع", "URGENT"),
      F("db_low", "افت قند همراه با تعریق، لرزش یا گیجی که با خوردن قند بهتر نمی‌شود", "URGENT"),
    ],
  },
  { code: "other", labelFa: "سایر / مطمئن نیستم", specialties: ["general"], baseUrgency: "ROUTINE", redFlags: [] },
];

export const COMPLAINT_BY_CODE = new Map(COMPLAINTS.map((c) => [c.code, c]));
export const FLAG_BY_ID = new Map<string, RedFlag>([...GLOBAL_RED_FLAGS, ...COMPLAINTS.flatMap((c) => c.redFlags)].map((f) => [f.id, f]));
export const ALL_FLAG_IDS: ReadonlySet<string> = new Set(FLAG_BY_ID.keys());
