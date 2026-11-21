import { resolveModuleFlags, type ModuleFlag } from "@nobatyar/shared";

/**
 * وضعیت flagهای ماژولهای ارتقا در سمت سرور.
 * مقدارگرفتن از محیط یکبار موقع بارگذاری است؛ تغییر flag نیاز به restart دارد (قابل پیشبینی و ایمن).
 */
export const MODULE_FLAGS = resolveModuleFlags(process.env);

export function moduleEnabled(flag: ModuleFlag): boolean {
  return MODULE_FLAGS[flag];
}
