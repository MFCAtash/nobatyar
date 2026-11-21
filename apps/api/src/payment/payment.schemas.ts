import { z } from "zod";

/** ورودی شروع پرداخت. callbackUrl اختیاری است؛ فقط «مبدأ» آن (با لیست سفید) استفاده می‌شود و آدرس نهایی در سرور ساخته می‌شود. */
export const InitiateSchema = z.object({
  appointmentId: z.string().uuid(),
  callbackUrl: z.string().url().max(512).optional(),
});
export type InitiateInput = z.infer<typeof InitiateSchema>;

/**
 * بازگشت از درگاه. `authority` = توکن درگاه (Authority زرین‌پال، trackId زیبال، id آیدی‌پی).
 * `status` فقط «راهنمای نمایشی» است و در هیچ تصمیمی نقش ندارد (مرورگر قابل جعل است)؛ تنها پاسخ سرور درگاه معتبر است.
 */
export const VerifySchema = z.object({
  appointmentId: z.string().uuid(),
  authority: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
  status: z.string().max(16).optional(),
});
export type VerifyInput = z.infer<typeof VerifySchema>;
