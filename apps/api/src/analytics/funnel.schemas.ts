import { z } from "zod";
import { FUNNEL_STEPS, NPS_MAX, NPS_MIN } from "./funnel";

export const funnelEventSchema = z
  .object({
    step: z.enum(FUNNEL_STEPS),
    anonymousId: z.string().min(8).max(200),
    meta: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  })
  .strict();
export type FunnelEventInput = z.infer<typeof funnelEventSchema>;

export const funnelQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  maxWeeks: z.coerce.number().int().min(1).max(26).optional(),
});

export const feedbackSchema = z
  .object({
    score: z.number().int().min(NPS_MIN).max(NPS_MAX),
    step: z.enum(FUNNEL_STEPS).optional(),
    anonymousId: z.string().min(8).max(200).optional(),
  })
  .strict();
export type FeedbackInput = z.infer<typeof feedbackSchema>;

export const experimentUpsertSchema = z
  .object({
    variants: z.array(z.string().min(1).max(40)).min(1).max(10),
    enabled: z.boolean(),
  })
  .strict();
export type ExperimentUpsertInput = z.infer<typeof experimentUpsertSchema>;
