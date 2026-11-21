import { z } from "zod";

const fa = z.string().trim().min(3).max(1000);

export const createIncidentSchema = z.object({
  titleFa: z.string().trim().min(3).max(150),
  bodyFa: fa,
  impact: z.enum(["NONE", "MINOR", "MAJOR", "CRITICAL"]),
  componentId: z.enum(["api", "database", "realtime", "payments", "notifications"]).optional(),
}).strict();

export const updateIncidentSchema = z.object({
  status: z.enum(["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"]),
  bodyFa: fa,
}).strict();

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;
