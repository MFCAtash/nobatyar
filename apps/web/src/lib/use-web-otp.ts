"use client";
import { useEffect, useRef } from "react";
import { extractOtp, normalizeOtp } from "./otp";

/**
 * WebOTP: خواندن خودکار کد از پیامک (Chrome اندروید، فقط HTTPS).
 * پیامک باید در «آخرین خط» به شکل «@دامنه #کد» تمام شود (قالب Kavenegar؛ docs/phase-16-frontend-ux.md).
 * در مرورگرهای بدون پشتیبانی هیچ اتفاقی نمی‌افتد و کاربر کد را دستی (یا با autocomplete="one-time-code") وارد می‌کند.
 */
export function useWebOtp(active: boolean, onCode: (code: string) => void): void {
  const cb = useRef(onCode);
  cb.current = onCode;
  useEffect(() => {
    if (!active || typeof window === "undefined" || !("OTPCredential" in window) || !navigator.credentials) return;
    const ac = new AbortController();
    const opts = { otp: { transport: ["sms"] }, signal: ac.signal } as unknown as CredentialRequestOptions;
    navigator.credentials.get(opts)
      .then((cred) => {
        const raw = (cred as unknown as { code?: string } | null)?.code;
        const code = raw ? (extractOtp(raw) ?? normalizeOtp(raw)) : "";
        if (code) cb.current(code);
      })
      .catch(() => undefined); // کاربر رد کرد / منقضی شد
    return () => ac.abort();
  }, [active]);
}
