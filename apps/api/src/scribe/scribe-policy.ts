import { scrubString } from "@nobatyar/shared";

/** متن برچسب هشدار برای تمام خروجیها؛ پزشک موظف به بازبینی است. */
export const DRAFT_BANNER = "پیشنویس خودکار — باید توسط پزشک بازبینی و ویرایش شود؛ هرگز خودکار امضا نمیشود.";

/**
 * حذف PII از متن گفتار.
 * الگوهای shared (شماره موبایل، کد ملی، ایمیل، JWT، hex طولانی) اینجا اعمال میشوند.
 * محدودیت صریح: نام افراد توسط الگو قابل تشخیص نیست ⇒ بازبینی پزشک اجباری است.
 */
export function redactPii(text: string): string {
  return scrubString(text)
    .replace(/تاریخ\s+تولد\s*[:：]?\s*\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/gi, "تاریخ تولد [حذفشده]")
    .replace(/کد\s+ملی\s*[:：]?\s*\d{10}/gi, "کد ملی [حذفشده]")
    .replace(/شماره\s+پرونده\s*[:：]?\s*[A-Za-z0-9-]{5,}/gi, "شماره پرونده [حذفشده]");
}

const SEARCH: { section: "subjective" | "objective" | "assessment" | "plan"; re: RegExp }[] = [
  { section: "subjective", re: /(شکایت|میگوید|احساس|درد|سردرد|تب|سرگیجه|بیخوابی|خسته|علائم|چند روز|از دیروز|complaint|pain|fever|nausea)/i },
  { section: "objective", re: /(فشارخون|فشار خون|نبض|ضربان|دمای|درجه حرارت|وزن|قد|معاینه|آزمایش|blood pressure|pulse|temperature|exam|lab)/i },
  { section: "assessment", re: /(تشخیص|نظر من|احتمال|به نظر میرسد|دیابت|فشار بالا|assessment|diagnosis|likely)/i },
  { section: "plan", re: /(توصیه|نسخه|دارو|بازگشت|پیگیری|مراجعه|استراحت|آزمایش مجدد|پیگیر|plan|medication|follow up|return)/i },
];

export interface ScribeDraft {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  patientSummary: string;
}

/**
 * موتور محلی قابل ممیزی: هیچ تماس خارجی، هیچ مدل یادگیری و هیچ ذخیره متن خام در خارج از DB صورت نمیگیرد.
 * خروجی صرفاً «پیشنویس» است و فقط پزشک آن را میپذیرد یا ویرایش میکند (امضا جداگانه است).
 */
export function draftFromTranscript(rawTranscript: string): ScribeDraft {
  const text = redactPii(rawTranscript).replace(/\s+/g, " ").trim();
  if (!text) return { subjective: "", objective: "", assessment: "", plan: "", patientSummary: "" };
  const lines = text.split(/(?<=[.!?؟])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const buckets: Record<"subjective" | "objective" | "assessment" | "plan", string[]> = {
    subjective: [], objective: [], assessment: [], plan: [],
  };
  for (const line of lines) {
    const hit = SEARCH.find((s) => s.re.test(line));
    buckets[hit?.section ?? "subjective"].push(line);
  }
  const join = (a: string[]) => a.join(" ").slice(0, 4000);
  const summaryLines = [...buckets.subjective.slice(0, 2), ...buckets.assessment.slice(0, 1)];
  return {
    subjective: `${DRAFT_BANNER}\n${join(buckets.subjective)}`.slice(0, 4000),
    objective: join(buckets.objective),
    assessment: join(buckets.assessment),
    plan: join(buckets.plan),
    patientSummary: summaryLines.join(" ").slice(0, 2000) || "خلاصهای استخراج نشد؛ لطفاً دستی تکمیل شود.",
  };
}
