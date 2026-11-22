import { z } from "zod";
import { CONTRAST_LEVELS, LOCALES, MAX_FONT_SCALE, MIN_FONT_SCALE, THEMES } from "./ui-preferences";

export const uiPreferencesSchema = z
  .object({
    theme: z.enum(THEMES).optional(),
    fontScale: z.number().min(MIN_FONT_SCALE).max(MAX_FONT_SCALE).optional(),
    contrast: z.enum(CONTRAST_LEVELS).optional(),
    reducedMotion: z.boolean().optional(),
    locale: z.enum(LOCALES).optional(),
  })
  .strict();
export type UiPreferencesInput = z.infer<typeof uiPreferencesSchema>;
