import { z } from "zod";

/** قرارداد رویدادهای سوکت چت — منبع حقیقت مشترک بین gateway و تستها. */
export const SendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().max(4000).optional().default(""),
  kind: z.enum(["TEXT", "FILE", "IMAGE"]).default("TEXT"),
  objectKey: z.string().max(500).optional(),
  attachmentName: z.string().max(255).optional(),
  attachmentMime: z.string().max(80).optional(),
  attachmentBytes: z.number().int().nonnegative().optional(),
});

/**
 * علامت خوانده نیازی به messageId ندارد: سرویس تمام پیامهای طرف مقابل را علامت میزند.
 * پیشتر client فقط conversationId میفرستاد و سرور messageId اجباری میگرفت ⇒ خطای دائمی.
 * messageId اختیاری است تا clientهای قدیمی و جدید هر دو کار کنند.
 */
export const ReadSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().optional(),
});

export const JoinSchema = z.object({
  conversationId: z.string().uuid(),
});

export const TypingSchema = z.object({
  conversationId: z.string().uuid(),
  typing: z.boolean(),
});

export interface SendAck {
  ok: true;
  messageId: string;
}

/** کدهای خطای قابل تشخیص در سمت کلاینت (بدون متن پیام یا داده سلامت). */
export type ChatWsErrorCode = "unauthorized" | "invalid_payload" | "forbidden" | "not_found" | "server_error";

export interface ChatWsError {
  code: ChatWsErrorCode;
  message: string;
}
