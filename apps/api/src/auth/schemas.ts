import { z } from "zod";

export const requestOtpSchema = z.object({ phone: z.string().min(10).max(20) }).strict();
export const verifyOtpSchema = z.object({ phone: z.string().min(10).max(20), code: z.string().min(6).max(12) }).strict();
