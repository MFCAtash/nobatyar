import { z } from "zod";

export const quickReplySchema = z.object({ text: z.string().min(2).max(300) }).strict();
export type QuickReplyInput = z.infer<typeof quickReplySchema>;

export const summarizeSchema = z
  .object({
    /** رضایت صریح بیمار برای ساخت خلاصه؛ باید در همان درخواست تأیید شود. */
    consentId: z.string().uuid(),
  })
  .strict();
export type SummarizeInput = z.infer<typeof summarizeSchema>;
