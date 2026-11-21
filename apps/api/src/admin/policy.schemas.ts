import { z } from "zod";
import { APPOINTMENT_STATUSES } from "@nobatyar/shared";

/** جداسازی schemaها از کنترلر تا OpenAPI آنها را بدون import کنترلر بخواند. */
export const simulateSchema = z.object({
  version: z.number().int().positive().optional(),
  action: z.enum([
    "CONFIRM", "DOCTOR_CANCEL", "PATIENT_CANCEL", "START", "COMPLETE",
    "REPORT_PATIENT_NO_SHOW", "REPORT_DOCTOR_NO_SHOW", "EXPIRE", "PAYMENT_SUCCEEDED",
  ]),
  from: z.enum(APPOINTMENT_STATUSES),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  autoConfirm: z.boolean().default(false),
  paidRial: z.string().regex(/^\d+$/).optional(),
  now: z.string().datetime({ offset: true }).optional(),
}).strict();

export const activateSchema = z.object({ version: z.number().int().positive() }).strict();

export type SimulateInput = z.infer<typeof simulateSchema>;
