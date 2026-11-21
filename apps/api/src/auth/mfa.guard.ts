import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AUTH_CONFIG, type AuthConfig } from "../config/auth.config";
import { IS_PUBLIC } from "../common/decorators";

/**
 * فاز ۱۹: اجبار TOTP برای ادمینها.
 * مسیرهای مجاز هنگام نبودن claim ی mfa: ثبت/تأیید MFA، تأیید step-up، خروج و صفحات عمومی.
 * fail-closed: اگر سیاست فعال است و کاربر ADMIN است، تمام مسیرهای دیگر مسدود میشود.
 */
const EXEMPT = /^\/(auth\/mfa\/verify|auth\/mfa\/status|auth\/logout(?:\/all)?|me\/mfa(?:\/.*)?|status(?:\/.*)?)$/;

@Injectable()
export class MfaGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AUTH_CONFIG) private readonly cfg: AuthConfig,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (!this.cfg.adminRequireMfa) return true;
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<{ user?: { role: string; mfa?: boolean }; path?: string }>();
    const user = req.user;
    if (!user || user.role !== "ADMIN") return true;
    if (user.mfa === true) return true;
    const path = (req.path ?? "").replace(/^\/api\/v1/, "").replace(/\/$/, "") || "/";
    if (EXEMPT.test(path)) return true;
    throw new ForbiddenException({ error: "mfa_required" });
  }
}
