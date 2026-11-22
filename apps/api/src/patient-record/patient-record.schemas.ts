import { z } from "zod";
import { TIMELINE_KINDS } from "./timeline";

export const addTimelineSchema = z
  .object({
    kind: z.enum(TIMELINE_KINDS),
    value: z.string().min(1).max(32),
    unit: z.string().min(1).max(16).optional(),
    at: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export type AddTimelineInput = z.infer<typeof addTimelineSchema>;

export const timelineQuerySchema = z.object({
  kind: z.enum(TIMELINE_KINDS).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

export const reconcileSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            name: z.string().min(2).max(120),
            dose: z.string().max(60).optional(),
            note: z.string().max(200).optional(),
          })
          .strict(),
      )
      .max(50),
    reviewedBy: z.string().uuid().optional(),
  })
  .strict();
export type ReconcileInput = z.infer<typeof reconcileSchema>;

export const exportSchema = z.object({ passphrase: z.string().min(12).max(200) }).strict();
export type ExportInput = z.infer<typeof exportSchema>;
