import { ForbiddenException, Inject, NotFoundException } from "@nestjs/common";
import { Controller, Get, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { AUTH_CONFIG, type AuthConfig } from "../config/auth.config";
import { FIELD_CRYPTO, type FieldCrypto } from "../crypto";
import { normalizeIranMobile } from "../crypto/phone";
import { PrismaService } from "../prisma/prisma.service";
import { CurrentUser, Public } from "../common/decorators";
import type { Role } from "@nobatyar/shared";
import { AuthService } from "./auth.service";
import { refreshCookieOptions, REFRESH_COOKIE } from "./http-security";

const DEMO_PHONES: Record<Role, string> = {
  PATIENT: "09120000002",
  DOCTOR: "09120000001",
  ADMIN: "09120000003",
};

/**
 * ورود دمو برای محیطهای توسعه/نمایش.
 * fail-closed: در production یا بدون DEMO_AUTOLOGIN=true، مسیرها 403 میدهند.
 * از همان AuthService/نشست/JWT استاندارد استفاده میکند؛ هیچ مسیر امنیتی دور زده نمیشود.
 */
@Controller("demo")
export class DemoController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
    @Inject(AUTH_CONFIG) private readonly cfg: AuthConfig,
  ) {}

  private assertEnabled(): Role {
    if (this.cfg.isProduction || process.env.DEMO_AUTOLOGIN !== "true") {
      throw new ForbiddenException({ error: "demo_disabled" });
    }
    const role = (process.env.DEMO_ROLE ?? "PATIENT") as Role;
    return role in DEMO_PHONES ? role : "PATIENT";
  }

  @Public()
  @Get("config")
  config() {
    const enabled = !this.cfg.isProduction && process.env.DEMO_AUTOLOGIN === "true";
    return { enabled, role: enabled ? (process.env.DEMO_ROLE ?? "PATIENT") : null };
  }

  @Public()
  @Post("login")
  async login(@Res({ passthrough: true }) res: Response) {
    const role = this.assertEnabled();
    const phone = normalizeIranMobile(DEMO_PHONES[role])!;
    const hash = this.crypto.blindIndex(phone, "phone");
    const user = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.user.findFirst({ where: { phoneHash: hash, status: "ACTIVE" }, select: { id: true, role: true } }),
    );
    if (!user) throw new NotFoundException({ error: "demo_user_missing", hint: "run pnpm --filter @nobatyar/api db:seed" });

    const tokens = await this.auth.issueTokensForUser(user.id, { ip: "demo", userAgent: "nobatyar-demo" });
    res.setHeader("Cache-Control", "no-store");
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, refreshCookieOptions(this.cfg.cookieSecure, tokens.refreshMaxAgeMs));
    return { accessToken: tokens.accessToken, tokenType: "Bearer", expiresIn: tokens.expiresInSec, role: user.role };
  }

  /** خروج از حالت دمو (فقط نمایشی؛ نشست.real با logout پاک میشود). */
  @Get("status")
  status(@CurrentUser() _u: unknown) {
    return { demo: this.cfg.isProduction ? false : process.env.DEMO_AUTOLOGIN === "true" };
  }
}
