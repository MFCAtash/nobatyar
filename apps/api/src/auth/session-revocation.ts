import type { VerifiedAccess } from "./token.service";
import type { KeyValueStore } from "../redis/kv-store";

/**
 * ابطال فوری access token (بدون نیاز به DB در هر درخواست).
 *
 * مسئله: JWT تا انقضا معتبر است؛ تعلیق کاربر/خروج/تغییر نقش باید «همین حالا» اثر کند.
 * راه‌حل: دو کلید کوتاه‌عمر در Redis (TTL = عمر access token ⇒ حافظه محدود می‌ماند):
 *   rev:sid:<sid>   ⇒ این نشست باطل است (logout، reuse ی refresh)
 *   rev:uid:<userId>⇒ «همه‌ی توکن‌های صادرشده تا این لحظه (ms)» باطل‌اند (logout-all، تعلیق، تغییر نقش)
 * توکن‌های بدون sid (پیش از استقرار) تا انقضای طبیعی فقط با cutoff کاربر قابل ابطال‌اند.
 */
export type RevocationVerdict = "ok" | "revoked" | "missing_sid";

export interface RevocationPolicy {
  /** توکن بدون sid رد شود؟ (پس از یک عمر access token از استقرار، true) */
  requireSid: boolean;
}

export const sidKey = (sid: string): string => `rev:sid:${sid}`;
export const uidKey = (uid: string): string => `rev:uid:${uid}`;

/** منطق خالص تصمیم؛ ورودی‌ها از Redis خوانده شده‌اند. cutoff = لحظه‌ی ابطال کاربر به ms (یا null). */
export function decide(claims: Pick<VerifiedAccess, "sid" | "iatMs">, sidRevoked: boolean, userCutoffMs: number | null, policy: RevocationPolicy): RevocationVerdict {
  if (!claims.sid && policy.requireSid) return "missing_sid";
  if (sidRevoked) return "revoked";
  // iatMs <= cutoff ⇒ پیش از (یا هم‌میلی‌ثانیه با) ابطال صادر شده؛ توکنِ بعد از آن (مثلاً refresh بلافاصله پس از تغییر نقش) معتبر است
  if (userCutoffMs !== null && claims.iatMs <= userCutoffMs) return "revoked";
  return "ok";
}

export class SessionRevocationUnavailable extends Error {
  constructor(cause?: unknown) {
    super("session revocation store unavailable");
    this.cause = cause;
  }
}

export class SessionRevocation {
  /**
   * @param ttlSec حداقل عمر کلیدها = عمر access token + tolerance ساعت
   * @param failOpen اگر Redis در دسترس نیست: true ⇒ اجازه (دسترس‌پذیری)، false ⇒ SessionRevocationUnavailable (امنیت؛ پیش‌فرض)
   */
  constructor(
    private readonly kv: Pick<KeyValueStore, "get" | "set">,
    private readonly ttlSec: number,
    private readonly policy: RevocationPolicy,
    private readonly failOpen = false,
    private readonly now: () => number = Date.now,
  ) {}

  /** نشست مشخص (یک دستگاه/خانواده‌ی refresh) باطل شود. */
  async revokeSession(sid: string): Promise<void> {
    await this.kv.set(sidKey(sid), "1", this.ttlSec);
  }

  /** همه‌ی توکن‌های فعلی کاربر باطل شوند (توکن‌های بعدی، که iat بزرگ‌تر دارند، معتبرند). */
  async revokeUser(userId: string): Promise<void> {
    await this.kv.set(uidKey(userId), String(this.now()), this.ttlSec);
  }

  async check(claims: Pick<VerifiedAccess, "sub" | "sid" | "iatMs">): Promise<RevocationVerdict> {
    try {
      const [sidHit, cutoffRaw] = await Promise.all([claims.sid ? this.kv.get(sidKey(claims.sid)) : Promise.resolve(null), this.kv.get(uidKey(claims.sub))]);
      const cutoff = cutoffRaw === null ? null : Number(cutoffRaw);
      return decide(claims, sidHit !== null, Number.isFinite(cutoff) ? cutoff : null, this.policy);
    } catch (e) {
      if (this.failOpen) return claims.sid || !this.policy.requireSid ? "ok" : "missing_sid";
      throw new SessionRevocationUnavailable(e);
    }
  }

  /**
   * برای اتصال‌های بلندمدت (WebSocket/SSE) که هر چند ثانیه دوباره می‌پرسند:
   * Redis ی ناپایدار نباید همه‌ی اتصال‌ها را قطع کند ⇒ «unknown» (نگه‌دار) جدا از «revoked» (قطع کن).
   */
  async recheck(c: { sub: string; sid?: string; iatMs?: number }): Promise<"valid" | "revoked" | "unknown"> {
    try {
      const v = await this.check({ sub: c.sub, sid: c.sid, iatMs: c.iatMs ?? 0 });
      return v === "ok" ? "valid" : "revoked";
    } catch (e) {
      if (e instanceof SessionRevocationUnavailable) return "unknown";
      throw e;
    }
  }
}
