import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ConsentType } from "@prisma/client";
import type { Role } from "@nobatyar/shared";
import { CONSENT_KEY, IS_PUBLIC, ROLES_KEY } from "../common/decorators";
import { PrismaService } from "../prisma/prisma.service";
import { SessionRevocation, SessionRevocationUnavailable } from "./session-revocation";
import { TokenService } from "./token.service";

/** پیش‌فرض: همه‌ی مسیرها نیاز به توکن دارند، مگر @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(SessionRevocation) private readonly revocation: SessionRevocation,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers["authorization"];
    const m = header?.match(/^Bearer ([A-Za-z0-9\-_.]+)$/);
    if (!m) throw new UnauthorizedException({ error: "unauthorized" });

    const claims = await this.tokens.verifyAccess(m[1]);
    if (!claims) throw new UnauthorizedException({ error: "unauthorized" });
    try {
      // ابطال فوری: logout / تعلیق / تغییر نقش / reuse ی refresh (session-revocation.ts)
      if ((await this.revocation.check(claims)) !== "ok") throw new UnauthorizedException({ error: "unauthorized" });
    } catch (e) {
      if (e instanceof SessionRevocationUnavailable) throw new ServiceUnavailableException({ error: "session_check_unavailable" });
      throw e;
    }
    req.user = { id: claims.sub, role: claims.role, sid: claims.sid, iatMs: claims.iatMs, mfa: claims.mfa };
    return true;
  }
}

/** @Roles(...) — بدون آن هر کاربر احراز‌شده مجاز است. باید بعد از JwtAuthGuard ثبت شود. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!roles || roles.length === 0) return true;
    const user = ctx.switchToHttp().getRequest().user as { role: Role } | undefined;
    if (!user || !roles.includes(user.role)) throw new ForbiddenException({ error: "forbidden" });
    return true;
  }
}

/** @RequireConsent('HEALTH_DATA_PROCESSING') — رضایت فعال (غیرابطال‌شده) لازم است. */
@Injectable()
export class ConsentGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const type = this.reflector.getAllAndOverride<ConsentType | undefined>(CONSENT_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!type) return true;
    const user = ctx.switchToHttp().getRequest().user as { id: string; role: Role } | undefined;
    if (!user) throw new UnauthorizedException({ error: "unauthorized" });

    const active = await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.consent.findFirst({ where: { userId: user.id, type, revokedAt: null }, select: { id: true } }),
    );
    if (!active) throw new ForbiddenException({ error: "consent_required", consent: type });
    return true;
  }
}

/** نام مستعار برای import راحت‌تر */
export const JwtGuard = JwtAuthGuard;

/** Guard برای WebSocket — فقط export است، احراز هویت در handleConnection انجام می‌شود */
export class WsJwtGuard {}
