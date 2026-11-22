import { z } from "zod";

export const ruleSchema = z
  .object({
    id: z.string().min(1).max(60),
    anyOf: z.array(z.string().min(1).max(120)).min(1).max(20),
    level: z.enum(["EMERGENCY", "URGENT", "ROUTINE"]),
    explanationFa: z.string().min(10).max(500),
  })
  .strict();

export const createRuleSetSchema = z
  .object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    rules: z.array(ruleSchema).min(1).max(100),
    approvedByLabel: z.string().min(2).max(120),
  })
  .strict();
export type CreateRuleSetInput = z.infer<typeof createRuleSetSchema>;

export const evaluateSchema = z
  .object({ symptoms: z.array(z.string().min(1).max(120)).max(30) })
  .strict();
export type EvaluateInput = z.infer<typeof evaluateSchema>;
