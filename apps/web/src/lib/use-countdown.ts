"use client";
import { useCallback, useEffect, useState } from "react";

/** شمارنده‌ی معکوس ثانیه‌ای (ارسال مجدد OTP). */
export function useCountdown(): { left: number; start: (sec: number) => void } {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return { left, start: useCallback((sec: number) => setLeft(Math.max(0, Math.floor(sec))), []) };
}
