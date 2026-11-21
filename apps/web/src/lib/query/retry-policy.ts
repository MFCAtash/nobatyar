import { ApiError } from "../api";

export const MAX_RETRIES = 2;

/**
 * سیاست تلاش دوباره: خطای شبکه و ۵xx و ۴۰۸ ⇒ تا ۲ بار؛ سایر ۴xx (۴۰۱/۴۰۳/۴۰۴/۴۰۹/۴۲۹ …) ⇒ هرگز.
 * (۴۰۱ را api.ts خودش با refresh مدیریت می‌کند؛ ۴۲۹ را نباید با تلاش مجدد تشدید کرد.)
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408) return false;
  return failureCount < MAX_RETRIES;
}

export const retryDelay = (attempt: number): number => Math.min(1000 * 2 ** attempt, 8000);
