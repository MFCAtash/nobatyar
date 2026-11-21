import type { CSSProperties } from "react";

/**
 * تنها راه مجاز برای style ی پویا: فقط custom property (مثل --level) تنظیم می‌شود و ظاهر در CSS می‌ماند.
 * قانون ESLint «no-restricted-syntax» هر style ی دیگری را رد می‌کند.
 */
export function cssVars(vars: Record<`--${string}`, string | number>): CSSProperties {
  return vars as unknown as CSSProperties;
}
