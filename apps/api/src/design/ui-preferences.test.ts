import { describe, expect, it } from "vitest";
import {
  clampFontScale,
  DEFAULT_UI_PREFERENCES,
  MAX_FONT_SCALE,
  MIN_FONT_SCALE,
  normalizeUiPreferences,
  toCssVars,
} from "./ui-preferences";

describe("M15 UI preferences", () => {
  it("returns defaults for empty/invalid input", () => {
    expect(normalizeUiPreferences(null)).toEqual(DEFAULT_UI_PREFERENCES);
    expect(
      normalizeUiPreferences({
        theme: "neon" as never,
        contrast: "x" as never,
        locale: "de" as never,
        fontScale: Number.NaN,
        reducedMotion: false,
      }),
    ).toEqual(DEFAULT_UI_PREFERENCES);
  });

  it("clamps font scale to the allowed range and 0.05 steps", () => {
    expect(clampFontScale(10)).toBe(MAX_FONT_SCALE);
    expect(clampFontScale(0)).toBe(MIN_FONT_SCALE);
    expect(clampFontScale(1.234)).toBe(1.25);
    expect(clampFontScale(Number.NaN)).toBe(1);
  });

  it("accepts valid values", () => {
    const p = normalizeUiPreferences({
      theme: "high-contrast",
      fontScale: 1.3,
      contrast: "most",
      reducedMotion: true,
      locale: "en",
    });
    expect(p).toEqual({
      theme: "high-contrast",
      fontScale: 1.3,
      contrast: "most",
      reducedMotion: true,
      locale: "en",
    });
  });

  it("emits safe CSS variables", () => {
    expect(toCssVars({ ...DEFAULT_UI_PREFERENCES, reducedMotion: true })).toEqual({
      "--app-font-scale": "1",
      "--app-motion": "0",
      "--app-contrast": "normal",
    });
  });
});
