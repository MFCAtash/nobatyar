/**
 * A11: امتیاز ریسک غیبت — سادهای توضیحپذیر و قطعی (۰–۱۰۰).
 * صرفاً برای یادآوری هدفمند است؛ هیچ تصمیم بالینی/مالی بر اساس آن گرفته نمیشود.
 */
export interface NoShowFacts {
  priorNoShows: number;
  leadDays: number;
  hourTehran: number;
  kind: "IN_PERSON" | "VIDEO" | "CHAT";
}

export interface NoShowRisk { score: number; reasons: string[] }

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function scoreNoShow(f: NoShowFacts): NoShowRisk {
  let score = 8;
  const reasons: string[] = ["پایه"];
  if (f.priorNoShows > 0) {
    const add = Math.min(45, f.priorNoShows * 18);
    score += add;
    reasons.push(`سابقه غیبت (${f.priorNoShows})`);
  }
  if (f.leadDays <= 1) { score += 12; reasons.push("رزرو نزدیک"); }
  else if (f.leadDays >= 14) { score += 8; reasons.push("فاصله طولانی تا ویزیت"); }
  if (f.kind === "VIDEO") { score += 6; reasons.push("ویزیت آنلاین"); }
  if (f.hourTehran >= 17 || f.hourTehran < 8) { score += 10; reasons.push("ساعت غیرمعمول"); }
  if (f.hourTehran === 12 || f.hourTehran === 13) { score += 5; reasons.push("ساعت ناهار"); }
  return { score: clamp(score), reasons };
}
