import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/types";
import { z } from "zod";
import { AUTH_CONFIG, AuthConfig } from "../config/auth.config";
import { AuthUser, ClientIp, CurrentUser, Public } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { AuthService, RequestMeta, Tokens } from "./auth.service";
import { refreshCookieOptions, REFRESH_COOKIE } from "./http-security";
import { PasskeyService } from "./passkey.service";

export const webauthnResponseSchema = z
  .object({
    id: z.string().min(1).max(2048),
    rawId: z.string().min(1).max(2048),
    type: z.literal("public-key"),
    response: z
      .object({
        clientDataJSON: z.string().min(1).max(8192),
        attestationObject: z.string().max(65536).optional(),
        authenticatorData: z.string().max(16384).optional(),
        signature: z.string().max(16384).optional(),
        userHandle: z.string().max(2048).nullable().optional(),
        transports: z.array(z.string().max(32)).max(8).optional(),
      })
      .passthrough(),
    clientExtensionResults: z.record(z.unknown()).optional(),
    authenticatorAttachment: z.string().max(32).optional(),
  })
  .passthrough();

@Controller("auth/passkey")
export class PasskeyController {
  constructor(
    @Inject(PasskeyService) private readonly passkeys: PasskeyService,
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

  @Get("credentials")
  list(@CurrentUser() u: AuthUser) {
    return this.passkeys.list(u);
  }

  @Delete("credentials/:id")
  @HttpCode(200)
  remove(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.passkeys.remove(u, id);
  }

  @Post("register/options")
  @HttpCode(200)
  registerOptions(@CurrentUser() u: AuthUser) {
    return this.passkeys.registrationOptions(u);
  }

  @Post("register/verify")
  @HttpCode(200)
  registerVerify(@CurrentUser() u: AuthUser, @Body(new ZodPipe(webauthnResponseSchema)) body: z.infer<typeof webauthnResponseSchema>) {
    return this.passkeys.verifyRegistration(u, body as unknown as RegistrationResponseJSON);
  }

  @Public()
  @Post("login/options")
  @HttpCode(200)
  loginOptions(@ClientIp() ip: string) {
    return this.passkeys.authenticationOptions(ip);
  }

  @Public()
  @Post("login/verify")
  @HttpCode(200)
  async loginVerify(
    @Body(new ZodPipe(webauthnResponseSchema)) body: z.infer<typeof webauthnResponseSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @ClientIp() ip: string,
  ) {
    const userId = await this.passkeys.verifyAuthentication(body as unknown as AuthenticationResponseJSON, ip);
    return this.respond(res, await this.auth.issueTokensForUser(userId, this.meta(req, ip)));
  }
}
