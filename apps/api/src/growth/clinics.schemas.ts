import { z } from "zod";
import { WORKSPACE_DASHBOARDS } from "./clinics";

export const clinicQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  maxKm: z.coerce.number().positive().max(2000).optional(),
  q: z.string().max(80).optional(),
  verifiedOnly: z.enum(["0", "1"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const createClinicSchema = z
  .object({
    name: z.string().min(2).max(120),
    addressFa: z.string().min(2).max(300),
    phone: z.string().min(3).max(30),
    geoLat: z.number().min(-90).max(90).nullable().optional(),
    geoLng: z.number().min(-180).max(180).nullable().optional(),
    verified: z.boolean().optional(),
  })
  .strict()
  .refine((v) => (v.geoLat == null) === (v.geoLng == null), {
    message: "geoLat and geoLng must be provided together",
  });
export type CreateClinicInput = z.infer<typeof createClinicSchema>;

export const workspaceSchema = z.object({ dashboard: z.enum(WORKSPACE_DASHBOARDS) }).strict();
export type WorkspaceInput = z.infer<typeof workspaceSchema>;

export const createPlanSchema = z
  .object({ name: z.string().min(2).max(80), seats: z.number().int().min(1).max(100_000) })
  .strict();
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

export const seatsQuerySchema = z.object({ used: z.coerce.number().int().min(0).max(1_000_000) });
