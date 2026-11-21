export const REFRESH_COOKIE = "nb_refresh";
export const REFRESH_COOKIE_PATH = "/api/v1/auth";
export const CSRF_HEADER = "x-nobatyar-csrf";

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function refreshCookieOptions(secure: boolean, maxAgeMs: number) {
  return { httpOnly: true, secure, sameSite: "strict" as const, path: REFRESH_COOKIE_PATH, maxAge: maxAgeMs };
}

/**
 * دفاع CSRF برای مسیرهایی که با کوکی کار می‌کنند (refresh/logout):
 *  ۱) SameSite=Strict روی کوکی
 *  ۲) هدر سفارشی اجباری (مرورگر برای هدر سفارشی preflight می‌فرستد و CORS آن را محدود می‌کند)
 *  ۳) اگر Origin ارسال شده باید در فهرست مجاز باشد
 */
export function isCsrfSafe(headers: Record<string, string | string[] | undefined>, allowedOrigins: string[]): boolean {
  if (headers[CSRF_HEADER] !== "1") return false;
  const origin = headers["origin"];
  if (typeof origin === "string" && origin !== "") return allowedOrigins.includes(origin);
  return true;
}
