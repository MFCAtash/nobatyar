import { z } from "zod";
import { CHAOS_TARGETS, RUNBOOKS } from "./slo";

export const putSloSchema = z
  .object({
    objective: z.number().gt(0).lt(100),
    window: z.enum(["30d", "7d", "1d"]),
  })
  .strict();
export type PutSloInput = z.infer<typeof putSloSchema>;

export const chaosSchema = z
  .object({
    approved: z.boolean(),
    windowFrom: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    windowTo: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  })
  .strict()
  .refine((v) => (v.windowFrom == null) === (v.windowTo == null), {
    message: "windowFrom and windowTo must be provided together",
  });
export type ChaosInput = z.infer<typeof chaosSchema>;

export const chaosTargetSchema = z.enum(CHAOS_TARGETS);
export const runbookSchema = z.object({ name: z.enum(RUNBOOKS) }).strict();
