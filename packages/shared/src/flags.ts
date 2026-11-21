/**
 * Feature flagهای ماژولهای نقشهٔ ارتقا (M1–M15).
 * مقدار پیشفرض `false` است: هیچ ماژول جدیدی بدون تصریح محیط فعال نمیشود.
 * منبع: docs/roadmap-master-plan.md
 */
export const MODULE_FLAG_DEFAULTS = {
  FF_M1_PASSKEY_FIRST: false,
  FF_M2_STATE_POLICY: false,
  FF_M3_SMART_BOOKING: false,
  FF_M4_FINANCE_AUTO: false,
  FF_M5_NOTIF_ORCHESTRATOR: false,
  FF_M6_SMART_FILES: false,
  FF_M7_CHAT_ASSIST: false,
  FF_M8_VIDEO_SMART: false,
  FF_M9_PATIENT_RECORD: false,
  FF_M10_TRIAGE_GOV: false,
  FF_M11_AUTO_OPS: false,
  FF_M12_QUALITY: false,
  FF_M13_PRODUCT_ANALYTICS: false,
  FF_M14_ECOSYSTEM: false,
  FF_M15_WCAG: false,
} as const;

export type ModuleFlag = keyof typeof MODULE_FLAG_DEFAULTS;

/** فقط مقدار دقیق `"true"` یک flag را فعال میکند (fail-closed). */
export function isFlagEnabled(value: string | undefined): boolean {
  return value === "true";
}

/** حل flagها از یک محیط دلخواه — در سرور و تست قابل استفاده است. */
export function resolveModuleFlags(env: Record<string, string | undefined>): Record<ModuleFlag, boolean> {
  const out = {} as Record<ModuleFlag, boolean>;
  for (const key of Object.keys(MODULE_FLAG_DEFAULTS) as ModuleFlag[]) {
    out[key] = isFlagEnabled(env[key]);
  }
  return out;
}

/** شناسهٔ ماژول متناظر با هر flag (برای لاگ و داشبورد). */
export const MODULE_OF_FLAG: Record<ModuleFlag, string> = {
  FF_M1_PASSKEY_FIRST: "M1",
  FF_M2_STATE_POLICY: "M2",
  FF_M3_SMART_BOOKING: "M3",
  FF_M4_FINANCE_AUTO: "M4",
  FF_M5_NOTIF_ORCHESTRATOR: "M5",
  FF_M6_SMART_FILES: "M6",
  FF_M7_CHAT_ASSIST: "M7",
  FF_M8_VIDEO_SMART: "M8",
  FF_M9_PATIENT_RECORD: "M9",
  FF_M10_TRIAGE_GOV: "M10",
  FF_M11_AUTO_OPS: "M11",
  FF_M12_QUALITY: "M12",
  FF_M13_PRODUCT_ANALYTICS: "M13",
  FF_M14_ECOSYSTEM: "M14",
  FF_M15_WCAG: "M15",
};
