import { z } from "zod";

export const roomPolicySchema = z
  .object({
    waitingRoom: z.boolean().optional(),
    allowScreenShare: z.boolean().optional(),
    captions: z.boolean().optional(),
    recordConsent: z.boolean().optional(),
    retentionHours: z.number().int().min(1).max(720).nullable().optional(),
  })
  .strict();
export type RoomPolicyInput = z.infer<typeof roomPolicySchema>;

export const recordingConsentSchema = z.object({ accept: z.literal(true) }).strict();
