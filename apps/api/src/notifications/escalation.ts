/**
 * M5 — ارتقای تلفنیِ مسئولِ آمادهباش (on-call) پس از ناکامی کانالهای معمول
 * (inapp/sms/push/email). این ماژول خالص و قطعی است: هیچ تماس تلفنیِ واقعیای گرفته نمیشود؛
 * تنها «تصمیمِ ارتقا» و «تعداد تلاشهای تلفنی» محاسبه میشود تا در Audit ثبت و در تست اثبات شود.
 */

/** کانالِ مخصوص ارتقای تلفنی (جدا از کانالهای معمول اعلان). */
export const CALL_CHANNEL = "call";

/** ورودی تصمیمگیری ارتقا: وضعیت اعلان و تعداد تلاشهای انجامشده تا کنون. */
export interface EscalationDecision {
  eventType: string;
  retryCount: number;
  urgent: boolean;
  quiet: boolean;
  acknowledged: boolean;
}

/**
 * آیا باید به تلفن مسئولِ آمادهباش ارتقا دهیم؟
 *  - acknowledging/تأییدشده هرگز ارتقا نمییابد.
 *  - فوری/امنیتی: ساعات سکوت آنرا مسدود نمیکند و از ۱ تلاش به بعد ارتقا مییابد.
 *  - عادی: در ساعات سکوت ارتقا نمییابد و تنها از ۳ تلاش به بعد ارتقا مییابد.
 */
export function shouldEscalate(input: EscalationDecision): boolean {
  if (input.acknowledged) return false;
  if (input.urgent) return input.retryCount >= 1;
  if (input.quiet) return false;
  return input.retryCount >= 3;
}

/** تعداد تلاشهای تلفنیِ مجاز: حداقل ۱ و حداکثر ۳ (گیرهٔ ۱..۳). */
export function escalationTarget(retryCount: number): number {
  return Math.min(Math.max(retryCount, 1), 3);
}
