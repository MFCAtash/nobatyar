"use client";

import type { ReactNode } from "react";
import { isFlagEnabled, type ModuleFlag } from "@nobatyar/shared";

/**
 * گیت نمایش ماژولهای ارتقا در سمت کاربر.
 * همهٔ flagها پیشفرض خاموشاند؛ فقط NEXT_PUBLIC_FF_*=true آنها را روشن میکند.
 */
const PUBLIC_FLAGS: Record<ModuleFlag, boolean> = {
  FF_M1_PASSKEY_FIRST: isFlagEnabled(process.env.NEXT_PUBLIC_FF_M1_PASSKEY_FIRST),
  FF_M2_STATE_POLICY: isFlagEnabled(process.env.NEXT_PUBLIC_FF_M2_STATE_POLICY),
  FF_M3_SMART_BOOKING: isFlagEnabled(process.env.NEXT_PUBLIC_FF_M3_SMART_BOOKING),
  FF_M4_FINANCE_AUTO: isFlagEnabled(process.env.NEXT_PUBLIC_FF_M4_FINANCE_AUTO),
  FF_M5_NOTIF_ORCHESTRATOR: isFlagEnabled(process.env.NEXT_PUBLIC_FF_M5_NOTIF_ORCHESTRATOR),
  FF_M6_SMART_FILES: isFlagEnabled(process.env.NEXT_PUBLIC_FF_M6_SMART_FILES),
  FF_M7_CHAT_ASSIST: isFlagEnabled(process.env.NEXT_PUBLIC_FF_M7_CHAT_ASSIST),
  FF_M8_VIDEO_SMART: isFlagEnabled(process.env.NEXT_PUBLIC_FF_M8_VIDEO_SMART),
  FF_M9_PATIENT_RECORD: isFlagEnabled(process.env.NEXT_PUBLIC_FF_M9_PATIENT_RECORD),
  FF_M10_TRIAGE_GOV: isFlagEnabled(process.env.NEXT_PUBLIC_FF_M10_TRIAGE_GOV),
  FF_M11_AUTO_OPS: isFlagEnabled(process.env.NEXT_PUBLIC_FF_M11_AUTO_OPS),
  FF_M12_QUALITY: isFlagEnabled(process.env.NEXT_PUBLIC_FF_M12_QUALITY),
  FF_M13_PRODUCT_ANALYTICS: isFlagEnabled(process.env.NEXT_PUBLIC_FF_M13_PRODUCT_ANALYTICS),
  FF_M14_ECOSYSTEM: isFlagEnabled(process.env.NEXT_PUBLIC_FF_M14_ECOSYSTEM),
  FF_M15_WCAG: isFlagEnabled(process.env.NEXT_PUBLIC_FF_M15_WCAG),
};

export function moduleEnabled(flag: ModuleFlag): boolean {
  return PUBLIC_FLAGS[flag];
}

export function ModuleGate({
  flag,
  children,
  fallback = null,
}: {
  flag: ModuleFlag;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return <>{moduleEnabled(flag) ? children : fallback}</>;
}
