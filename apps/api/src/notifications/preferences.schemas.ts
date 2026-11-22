import { z } from "zod";
import { CHANNELS, EVENT_TYPES } from "./orchestrator";

export const putPreferencesSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            eventType: z.enum(EVENT_TYPES),
            channel: z.enum(CHANNELS),
            enabled: z.boolean(),
          })
          .strict(),
      )
      .max(200),
    quietFrom: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
    quietTo: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  })
  .strict()
  .refine(
    (v) => (v.quietFrom == null) === (v.quietTo == null),
    { message: "quietFrom and quietTo must be provided together" },
  );

export type PutPreferencesInput = z.infer<typeof putPreferencesSchema>;

export const activateTemplateSchema = z.object({ version: z.number().int().positive() }).strict();
export type ActivateTemplateInput = z.infer<typeof activateTemplateSchema>;
