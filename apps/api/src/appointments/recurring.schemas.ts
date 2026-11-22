import { z } from "zod";

export const createRecurringSchema = z.object({
  doctorId: z.string().uuid(),
  rrule: z.string().min(5).max(120),
  kind: z.enum(["IN_PERSON", "VIDEO", "CHAT"]).default("VIDEO"),
  firstStartsAt: z.string().datetime({ offset: true }),
}).strict();

export type CreateRecurringDto = z.infer<typeof createRecurringSchema>;
