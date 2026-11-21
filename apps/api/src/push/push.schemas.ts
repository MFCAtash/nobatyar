import { z } from "zod";

/** خروجی PushSubscription.toJSON() مرورگر. endpoint فقط https و با سقف طول. */
export const SubscribeSchema = z.object({
  endpoint: z.string().url().max(2048).refine((u) => u.startsWith("https://"), "endpoint must be https"),
  keys: z.object({
    p256dh: z.string().min(20).max(200).regex(/^[A-Za-z0-9_-]+={0,2}$/),
    auth: z.string().min(8).max(100).regex(/^[A-Za-z0-9_-]+={0,2}$/),
  }),
});
export type SubscribeInput = z.infer<typeof SubscribeSchema>;

export const UnsubscribeSchema = z.object({ endpoint: z.string().url().max(2048) });
export type UnsubscribeInput = z.infer<typeof UnsubscribeSchema>;
