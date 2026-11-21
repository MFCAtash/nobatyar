import { z } from "zod";

export const updateProfileSchema = z.object({ fullName: z.string().trim().min(2).max(100) }).strict();

/// فاز ۱۹: AMBIENT_SCRIBE رضایت جداگانه و صریح برای ضبط/پردازش ویزیت توسط دستیار بالینی
export const CONSENT_TYPES = ["PRIVACY_POLICY", "HEALTH_DATA_PROCESSING", "TERMS", "AMBIENT_SCRIBE"] as const;
export const grantConsentSchema = z
  .object({ type: z.enum(CONSENT_TYPES), version: z.string().trim().min(1).max(32) })
  .strict();
export const consentTypeParamSchema = z.enum(CONSENT_TYPES);
