/**
 * M15 — ترجیحات ظاهر/دسترس‌پذیری (منطق خالص).
 *
 * ورودی کاربر هرگز مستقیماً در CSS تزریق نمی‌شود؛ فقط مقادیر allow-list و
 * بازهٔ عددی محدود پذیرفته می‌شود.
 */

export const THEMES = ["system", "light", "dark", "high-contrast"] as const;
export type Theme = (typeof THEMES)[number];

export const CONTRAST_LEVELS = ["normal", "more", "most"] as const;
export type Contrast = (typeof CONTRAST_LEVELS)[number];

export const LOCALES = ["fa", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export interface UiPreferences {
  theme: Theme;
  fontScale: number;
  contrast: Contrast;
  reducedMotion: boolean;
  locale: Locale;
}

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  theme: "system",
  fontScale: 1,
  contrast: "normal",
  reducedMotion: false,
  locale: "fa",
};

export const MIN_FONT_SCALE = 0.85;
export const MAX_FONT_SCALE = 1.5;

/** گام‌های مجاز اندازهٔ فونت (۰.۰۵)؛ مقدار آزاد به نزدیک‌ترین گام گرد می‌شود. */
export function clampFontScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  const clamped = Math.min(Math.max(value, MIN_FONT_SCALE), MAX_FONT_SCALE);
  return Math.round(clamped * 20) / 20;
}

/** ادغام جزئی روی پیش‌فرض‌ها؛ مقدار ناشناخته ⇒ پیش‌فرض (fail-closed، بدون خطا). */
export function normalizeUiPreferences(input: Partial<Record<keyof UiPreferences, unknown>> | null | undefined): UiPreferences {
  const p = input ?? {};
  return {
    theme: (THEMES as readonly string[]).includes(typeof p.theme === "string" ? p.theme : "")
      ? (p.theme as Theme)
      : DEFAULT_UI_PREFERENCES.theme,
    fontScale: clampFontScale(typeof p.fontScale === "number" ? p.fontScale : DEFAULT_UI_PREFERENCES.fontScale),
    contrast: (CONTRAST_LEVELS as readonly string[]).includes(typeof p.contrast === "string" ? p.contrast : "")
      ? (p.contrast as Contrast)
      : DEFAULT_UI_PREFERENCES.contrast,
    reducedMotion: p.reducedMotion === true,
    locale: (LOCALES as readonly string[]).includes(typeof p.locale === "string" ? p.locale : "")
      ? (p.locale as Locale)
      : DEFAULT_UI_PREFERENCES.locale,
  };
}

/** تولید CSS variables امن برای اعمال در ریشهٔ صفحه. */
export function toCssVars(p: UiPreferences): Record<string, string> {
  return {
    "--app-font-scale": String(p.fontScale),
    "--app-motion": p.reducedMotion ? "0" : "1",
    "--app-contrast": p.contrast,
  };
}
