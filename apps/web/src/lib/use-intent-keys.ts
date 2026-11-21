"use client";
import { useRef } from "react";
import { IntentKeys } from "./idempotency";

/** یک IntentKeys برای عمر کامپوننت (تلاش‌های مجدد همان قصد، همان کلید). */
export function useIntentKeys(): IntentKeys {
  const ref = useRef<IntentKeys | null>(null);
  if (!ref.current) ref.current = new IntentKeys();
  return ref.current;
}
