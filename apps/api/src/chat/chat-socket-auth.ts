import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Socket } from "socket.io";
import { SessionRevocation } from "../auth/session-revocation";
import { TokenService } from "../auth/token.service";
import type { AuthUser } from "../common/decorators";

/** احراز هویت و بازبررسی ابطال برای WebSocket (جدا از منطق پیام‌ها). */
@Injectable()
export class ChatSocketAuth {
  constructor(
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(SessionRevocation) private readonly revocation: SessionRevocation,
  ) {}

  /** JWT از handshake.auth.token یا query.token. ابطال فوری (logout/تعلیق/تغییر نقش): با Redis ی ناپایدار ⇒ رد (fail-closed). */
  async authenticate(socket: Socket): Promise<AuthUser> {
    const token = (socket.handshake.auth?.token as string | undefined) ?? (socket.handshake.query?.token as string | undefined);
    if (!token) throw new UnauthorizedException();
    const payload = await this.tokens.verifyAccess(token).catch(() => null);
    if (!payload) throw new UnauthorizedException();
    if ((await this.revocation.recheck(payload)) !== "valid") throw new UnauthorizedException();
    return { id: payload.sub, role: payload.role, sid: payload.sid, iatMs: payload.iatMs };
  }

  /** بازبررسی نشست یک سوکت باز. «unknown» (خطای Redis) ⇒ true تا خرابی زیرساخت همه را قطع نکند. */
  async isStillValid(user: AuthUser): Promise<boolean> {
    return (await this.revocation.recheck({ sub: user.id, sid: user.sid, iatMs: user.iatMs })) !== "revoked";
  }
}
