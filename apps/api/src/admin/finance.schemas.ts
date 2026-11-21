import { z } from "zod";

/** schema های ورودی پنل مالی (جدا از کنترلر تا OpenAPI بدون import کنترلر از آن‌ها بخواند). */
const STATUSES = ["PENDING", "PROCESSING", "PROCESSED", "FAILED", "MANUAL", "REVIEW"] as const;
export const refundListQuery = z.object({ status: z.enum(STATUSES).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) });
export const markSchema = z.object({ reference: z.string().trim().min(3).max(100).regex(/^[\p{L}\p{N}_\-./ ]+$/u), note: z.string().trim().max(500).optional() }).strict();
export const requestApprovalSchema = z.object({
  action: z.enum(["EXECUTE", "MARK_PROCESSED"]),
  /** فقط برای MARK_PROCESSED: مرجع بانکی که Checker «دقیقاً همان» را تأیید می‌کند */
  reference: z.string().trim().min(3).max(100).regex(/^[\p{L}\p{N}_\-./ ]+$/u).optional(),
  note: z.string().trim().max(500).optional(),
}).strict();
export const decideSchema = z.object({ note: z.string().trim().max(500).optional() }).strict();
export const rejectSchema = z.object({ note: z.string().trim().min(3).max(500) }).strict();
export const notRefundedSchema = z.object({ note: z.string().trim().min(5).max(500) }).strict();
export const paymentListQuery = z.object({
  status: z.enum(["INITIATED", "PAID", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"]).optional(),
  /** فقط موارد نیازمند توجه: PAID ی بدون هماهنگی با نوبت، یا INITIATED ی قدیمی */
  // ⚠️ z.coerce.boolean() رشته‌ی "false" را true می‌کرد (هر رشته‌ی غیرخالی truthy است) ⇒ enum صریح
  attention: z.enum(["true", "false", "1", "0"]).default("false").transform((v) => v === "true" || v === "1"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
