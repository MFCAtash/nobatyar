import { jwtVerify, SignJWT } from "jose";
import type { Role } from "@nobatyar/shared";
import { ROLES } from "@nobatyar/shared";
import type { AuthConfig } from "../config/auth.config";

const ISSUER = "nobatyar";
const AUDIENCE = "nobatyar-api";

export interface AccessClaims {
  sub: string;
  role: Role;
  /** شناسه‌ی نشست (= familyId ی refresh token). ابطال فوری با sid انجام می‌شود (session-revocation.ts). */
  sid?: string;
  /** فاز ۱۹: آیا احراز هویت دومرحلهای (TOTP) برای این نشست انجام شده است؟ */
  mfa?: boolean;
}

/** claim های تأییدشده + زمان صدور/انقضا (ثانیه) — برای سنجش با «زمان ابطال» کاربر. */
export interface VerifiedAccess extends AccessClaims {
  iat: number;
  exp: number;
  /**
   * زمان صدور با دقت میلی‌ثانیه (claim ی `ims`). iat ی JWT ثانیه‌ای است؛ برای مقایسه با «لحظه‌ی ابطال» دقت ms لازم است
   * تا توکنی که «بعد از» ابطال صادر شده (مثلاً refresh بلافاصله پس از تغییر نقش) هم‌ثانیه‌بودن باعث رد شدنش نشود.
   * توکن قدیمی بدون ims ⇒ iat×۱۰۰۰.
   */
  iatMs: number;
}

const SID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** JWT دسترسی کوتاه‌مدت (HS256). الگوریتم، issuer و audience در تأیید اجباری‌اند. */
export class TokenService {
  constructor(private readonly cfg: Pick<AuthConfig, "accessSecret" | "accessTtlSec">) {}

  async signAccess(claims: AccessClaims): Promise<{ token: string; expiresInSec: number }> {
    const token = await new SignJWT({ role: claims.role, ims: Date.now(), ...(claims.sid ? { sid: claims.sid } : {}), ...(claims.mfa ? { mfa: true } : {}) })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(claims.sub)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.cfg.accessTtlSec}s`)
      .sign(this.cfg.accessSecret);
    return { token, expiresInSec: this.cfg.accessTtlSec };
  }

  /** null اگر نامعتبر/منقضی. */
  async verifyAccess(token: string): Promise<VerifiedAccess | null> {
    try {
      const { payload } = await jwtVerify(token, this.cfg.accessSecret, {
        algorithms: ["HS256"],
        issuer: ISSUER,
        audience: AUDIENCE,
        clockTolerance: 5,
      });
      const role = payload.role as Role;
      if (typeof payload.sub !== "string" || !ROLES.includes(role)) return null;
      if (typeof payload.iat !== "number" || typeof payload.exp !== "number") return null;
      const sid = payload.sid;
      if (sid !== undefined && (typeof sid !== "string" || !SID_RE.test(sid))) return null;
      const ims = typeof payload.ims === "number" && Number.isFinite(payload.ims) ? payload.ims : payload.iat * 1000;
      return { sub: payload.sub, role, ...(sid ? { sid } : {}), ...(payload.mfa === true ? { mfa: true } : {}), iat: payload.iat, exp: payload.exp, iatMs: ims };
    } catch {
      return null;
    }
  }
}
