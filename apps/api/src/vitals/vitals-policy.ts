import type { VitalType } from "@prisma/client";

export interface VitalRule {
  unit: string;
  min: number;
  max: number;
  /** دومین مقدار (diastolic) */
  secondary?: { label: string; min: number; max: number };
}

/** دامنههای فیزیولوژیک معقول — فقط برای جلوگیری از ورودی اشتباه، نه تصمیم بالینی. */
export const VITAL_RULES: Record<VitalType, VitalRule> = {
  BLOOD_PRESSURE: { unit: "mmHg", min: 50, max: 300, secondary: { label: "diastolic", min: 30, max: 200 } },
  BLOOD_GLUCOSE: { unit: "mg/dL", min: 20, max: 1000 },
  WEIGHT: { unit: "kg", min: 1, max: 500 },
  HEART_RATE: { unit: "bpm", min: 20, max: 300 },
  BODY_TEMPERATURE: { unit: "°C", min: 30, max: 45 },
  OXYGEN_SATURATION: { unit: "%", min: 50, max: 100 },
};

export type VitalFlag = "normal" | "watch" | "alert";

/** آستانههای هشداردهنده؛ یک «هشدار» به معنای توصیه پزشکی نیست و جایگزین قضاوت پزشک نمیشود. */
export function classifyVital(type: VitalType, primary: number, secondary?: number | null): VitalFlag {
  switch (type) {
    case "BLOOD_PRESSURE": {
      const sys = primary;
      const dia = secondary ?? 0;
      if (sys >= 180 || dia >= 120 || sys < 90 || dia < 50) return "alert";
      if (sys >= 140 || dia >= 90) return "watch";
      return "normal";
    }
    case "BLOOD_GLUCOSE":
      if (primary >= 250 || primary < 54) return "alert";
      return primary >= 180 ? "watch" : "normal";
    case "HEART_RATE":
      return primary >= 130 || primary < 45 ? "alert" : primary >= 100 || primary < 60 ? "watch" : "normal";
    case "OXYGEN_SATURATION":
      return primary < 90 ? "alert" : primary < 95 ? "watch" : "normal";
    case "BODY_TEMPERATURE":
      return primary >= 39 || primary < 35 ? "alert" : primary >= 37.5 ? "watch" : "normal";
    default:
      return "normal";
  }
}

export function validateVital(type: VitalType, primary: number, secondary: number | null | undefined): string[] {
  const issues: string[] = [];
  const rule = VITAL_RULES[type];
  if (!Number.isFinite(primary) || primary < rule.min || primary > rule.max) issues.push(`value_primary_out_of_range_${rule.min}_${rule.max}`);
  if (rule.secondary) {
    if (type === "BLOOD_PRESSURE" && (secondary === null || secondary === undefined)) issues.push("diastolic_required");
    else if (secondary !== null && secondary !== undefined && (!Number.isFinite(secondary) || secondary < rule.secondary.min || secondary > rule.secondary.max)) {
      issues.push("value_secondary_out_of_range");
    }
    if (type === "BLOOD_PRESSURE" && secondary !== null && secondary !== undefined && secondary >= primary) issues.push("diastolic_must_be_below_systolic");
  } else if (secondary !== null && secondary !== undefined) issues.push("secondary_not_allowed");
  return issues;
}

/** روند ساده: میانگین اختلاف متوالیها (برای نمودار و FAQ پزشک؛ نه پیشبینی بالینی). */
export function trend(values: number[]): { direction: "up" | "down" | "flat"; deltaPerReading: number } {
  if (values.length < 2) return { direction: "flat", deltaPerReading: 0 };
  const diff = (values[values.length - 1]! - values[0]!) / (values.length - 1);
  return { direction: diff > 0.5 ? "up" : diff < -0.5 ? "down" : "flat", deltaPerReading: Math.round(diff * 100) / 100 };
}
