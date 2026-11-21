import { Body, Controller, HttpCode, Inject, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import { AUTH_CONFIG, AuthConfig } from "../config/auth.config";
import { AuthUser, ClientIp, CurrentUser, Public } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { AuthService, RequestMeta, Tokens } from "./auth.service";
import { isCsrfSafe, readCookie, refreshCookieOptions, REFRESH_COOKIE, REFRESH_COOKIE_PATH } from "./http-security";
import { requestOtpSchema, verifyOtpSchema } from "./schemas";

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AUTH_CONFIG) private readonly cfg: AuthConfig,
  ) {}

  private meta(req: Request, ip: string): RequestMeta {
    return { ip, userAgent: req.headers["user-agent"] };
  }

  private respond(res: Response, t: Tokens) {
    res.setHeader("Cache-Control", "no-store");
    res.cookie(REFRESH_COOKIE, t.refreshToken, refreshCookieOptions(this.cfg.cookieSecure, t.refreshMaxAgeMs));
    return { accessToken: t.accessToken, tokenType: "Bearer", expiresIn: t.expiresInSec };
  }

  private assertCsrf(req: Request) {
    if (!isCsrfSafe(req.headers, this.cfg.corsOrigins)) throw new UnauthorizedException({ error: "csrf" });
  }

  @Public()
  @HttpCode(202)
  @Post("otp/request")
  async requestOtp(@Body(new ZodPipe(requestOtpSchema)) body: { phone: string }, @Req() req: Request, @ClientIp() ip: string) {
    await this.auth.requestOtp(body.phone, this.meta(req, ip));
    return { status: "accepted" }; // همیشه یکسان
  }

  @Public()
  @HttpCode(200)
  @Post("otp/verify")
  async verifyOtp(
    @Body(new ZodPipe(verifyOtpSchema)) body: { phone: string; code: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @ClientIp() ip: string,
  ) {
    return this.respond(res, await this.auth.verifyOtp(body.phone, body.code, this.meta(req, ip)));
  }

  @Public()
  @HttpCode(200)
  @Post("refresh")
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response, @ClientIp() ip: string) {
    this.assertCsrf(req);
    const token = readCookie(req.headers.cookie, REFRESH_COOKIE);
    if (!token) throw new UnauthorizedException({ error: "invalid_refresh" });
    try {
      return this.respond(res, await this.auth.refresh(token, this.meta(req, ip)));
    } catch (e) {
      res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
      throw e;
    }
  }

  @Public()
  @HttpCode(204)
  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertCsrf(req);
    await this.auth.logout(readCookie(req.headers.cookie, REFRESH_COOKIE));
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }

  @HttpCode(204)
  @Post("logout-all")
  async logoutAll(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutAll(user.id, user.role);
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }
}
