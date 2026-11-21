import { toAsciiDigits } from "./format";

/** طول کد OTP؛ باید با OTP_LENGTH ی API یکی باشد (پیش‌فرض ۶، بین ۶ تا ۸). */
export const OTP_LENGTH = Number(process.env.NEXT_PUBLIC_OTP_LENGTH ?? 6) || 6;
export const OTP_MAX = 8;

/** ارقام فارسی/عربی ⇒ ASCII، حذف هر نویسه‌ی غیرعددی، سقف طول */
export function normalizeOtp(input: string): string {
  return toAsciiDigits(input).replace(/\D/g, "").slice(0, OTP_MAX);
}

/** آیا کد برای ارسال خودکار کامل است؟ */
export const isCompleteOtp = (code: string, length: number = OTP_LENGTH): boolean => new RegExp(`^\\d{${length}}$`).test(code);

/** از متن پیامک (WebOTP یا چسباندن) اولین دنباله‌ی ۶ تا ۸ رقمی را برمی‌دارد. */
export function extractOtp(text: string): string | null {
  const m = /(?<!\d)\d{6,8}(?!\d)/.exec(toAsciiDigits(text));
  return m ? m[0] : null;
}

/** ثانیه‌ی باقی‌مانده تا ارسال مجدد پس از اعمال خطای سرور (retryAfter) */
export const resendSeconds = (retryAfterSec: number | undefined, dflt = 60): number =>
  retryAfterSec && retryAfterSec > 0 ? Math.ceil(retryAfterSec) : dflt;
