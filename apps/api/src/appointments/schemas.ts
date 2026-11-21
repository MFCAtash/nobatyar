import { z } from "zod";

export const bookSchema = z
  .object({
    doctorId: z.string().uuid(),
    startsAt: z.string().datetime({ offset: true }),
    kind: z.enum(["IN_PERSON", "VIDEO", "CHAT"]).default("VIDEO"),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict();

/** فاز ۱۹: جابهجایی اتمی نوبت (بدون لغو و پرداخت مجدد) */
export const rescheduleSchema = z
  .object({ startsAt: z.string().datetime({ offset: true }) })
  .strict();

export const listSchema = z.object({
  status: z.enum([
    "PENDING_PAYMENT", "PENDING_CONFIRMATION", "CONFIRMED", "IN_PROGRESS", "COMPLETED",
    "CANCELLED_BY_PATIENT", "CANCELLED_BY_DOCTOR", "EXPIRED", "NO_SHOW_PATIENT", "NO_SHOW_DOCTOR",
  ]).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().uuid().optional(),
});

export type BookInput = z.infer<typeof bookSchema>;
export type RescheduleInput = z.infer<typeof rescheduleSchema>;
export type ListInput = z.infer<typeof listSchema>;
