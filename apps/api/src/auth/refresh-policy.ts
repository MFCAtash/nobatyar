import { createHash, randomBytes } from "node:crypto";

export type RefreshDecision = "ok" | "unknown" | "expired" | "reuse";

export interface SessionState {
  revokedAt: Date | null;
  expiresAt: Date;
}

/**
 * تصمیم برای refresh token ارائه‌شده:
 *  - unknown: هیچ نشستی با این هش نیست
 *  - reuse:   توکن قبلاً ابطال/چرخانده شده ⇒ احتمال سرقت ⇒ کل خانواده‌ی توکن باید باطل شود
 *  - expired: مهلت تمام شده
 */
export function evaluateRefresh(session: SessionState | null, now: Date): RefreshDecision {
  if (!session) return "unknown";
  if (session.revokedAt) return "reuse";
  if (session.expiresAt.getTime() <= now.getTime()) return "expired";
  return "ok";
}

/** توکن مات ۲۵۶ بیتی. فقط هش آن ذخیره می‌شود (SHA-256 برای ورودی پرآنتروپی کافی است). */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
