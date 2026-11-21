import { randomUUID } from "node:crypto";
import { HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Role } from "@nobatyar/shared";
import { AuditService } from "../audit/audit.service";
import { AUTH_CONFIG, AuthConfig } from "../config/auth.config";
import { aad, FIELD_CRYPTO, FieldCrypto, normalizeIranMobile, toAsciiDigits } from "../crypto";
import { PrismaService } from "../prisma/prisma.service";
import { KV_STORE, KeyValueStore } from "../redis/kv-store";
import { OtpService } from "./otp.service";
import { RateLimiter } from "./rate-limit";
import { SessionRevocation } from "./session-revocation";
import { evaluateRefresh, generateRefreshToken, hashRefreshToken } from "./refresh-policy";
import { TokenService } from "./token.service";

export interface Tokens {
  accessToken: string;
  expiresInSec: number;
  refreshToken: string;
  refreshMaxAgeMs: number;
}

export interface RequestMeta {
  ip: string;
  userAgent?: string;
}

const tooMany = (retryAfterSec: number) =>
  new HttpException({ error: "too_many_requests", retryAfterSec }, HttpStatus.TOO_MANY_REQUESTS);

@Injectable()
export class AuthService {
  private readonly limiter: RateLimiter;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OtpService) private readonly otp: OtpService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
    @Inject(AUTH_CONFIG) private readonly cfg: AuthConfig,
    @Inject(KV_STORE) kv: KeyValueStore,
    @Inject(SessionRevocation) private readonly revocation: SessionRevocation,
  ) {
    this.limiter = new RateLimiter(kv);
  }

  /** سقف تلاش به‌ازای IP روی مسیرهای حساس (علاوه بر قفل OTP هر شماره). */
  private async limitIp(scope: string, ip: string, limit: number, windowSec: number): Promise<void> {
    const r = await this.limiter.hit(`${scope}:${ip}`, limit, windowSec);
    if (!r.allowed) throw tooMany(r.retryAfterSec);
  }

  /** پاسخ برای شماره‌ی نامعتبر هم یکسان است (بدون افشای وضعیت/وجود حساب). */
  async requestOtp(rawPhone: string, meta: RequestMeta): Promise<void> {
    const phone = normalizeIranMobile(rawPhone);
    if (!phone) return;
    const r = await this.otp.request(phone, meta.ip);
    if (!r.ok) throw tooMany(r.retryAfterSec);
  }

  async verifyOtp(rawPhone: string, rawCode: string, meta: RequestMeta): Promise<Tokens> {
    await this.limitIp("verify:ip", meta.ip, this.cfg.verifyPerIp10Min, 600);
    const phone = normalizeIranMobile(rawPhone);
    const code = toAsciiDigits(rawCode);
    if (!phone || !/^\d{6,8}$/.test(code)) throw new UnauthorizedException({ error: "invalid_code" });

    const r = await this.otp.verify(phone, code);
    if (!r.ok) {
      if (r.reason === "locked") {
        // Audit فقط برای قفل‌شدن (نه هر حدس اشتباه): زنجیره‌ی Audit سریالی است و نباید با سیل درخواست کند شود
        await this.audit.log({ action: "auth.otp_locked", objectType: "auth", meta: { ipHash: this.ipHash(meta.ip) } });
        throw tooMany(r.retryAfterSec ?? this.cfg.otpLockSec);
      }
      throw new UnauthorizedException({ error: "invalid_code" });
    }

    const user = await this.findOrCreateUser(phone);
    if (user.status !== "ACTIVE") throw new UnauthorizedException({ error: "invalid_code" });
    return this.createSession(user.id, user.role, randomUUID(), meta, "auth.login", user.mfaEnabledAt !== null);
  }

  /** چرخش refresh token؛ استفاده‌ی مجدد از توکن چرخیده‌شده ⇒ ابطال کل خانواده. */
  async refresh(rawToken: string, meta: RequestMeta): Promise<Tokens> {
    await this.limitIp("refresh:ip", meta.ip, this.cfg.refreshPerIp10Min, 600);
    const hash = hashRefreshToken(rawToken);
    const now = new Date();

    type Outcome = { kind: "ok"; userId: string; familyId: string } | { kind: "fail"; reusedFamily?: string };
    const outcome = await this.prisma.withContext({ role: "SYSTEM" }, async (tx): Promise<Outcome> => {
      const s = await tx.session.findUnique({ where: { refreshTokenHash: hash } });
      const decision = evaluateRefresh(s, now);
      if (decision === "reuse" && s) {
        await tx.session.updateMany({ where: { familyId: s.familyId, revokedAt: null }, data: { revokedAt: now } });
        await this.audit.logIn(tx, { actorId: s.userId, action: "auth.refresh_reuse_detected", objectType: "session", objectId: s.familyId });
        return { kind: "fail", reusedFamily: s.familyId };
      }
      if (decision !== "ok" || !s) return { kind: "fail" };
      // ابطال اتمیک: اگر دو درخواست هم‌زمان بیایند، فقط یکی count=1 می‌گیرد
      const upd = await tx.session.updateMany({ where: { id: s.id, revokedAt: null }, data: { revokedAt: now } });
      if (upd.count !== 1) return { kind: "fail" };
      return { kind: "ok", userId: s.userId, familyId: s.familyId };
    });
    if (outcome.kind === "fail" && outcome.reusedFamily) await this.revocation.revokeSession(outcome.reusedFamily); // توکن دزدیده‌شده: access token های این نشست هم همین حالا بی‌اثر
    if (outcome.kind === "fail") throw new UnauthorizedException({ error: "invalid_refresh" });

    // نقش و وضعیت از دیتابیس تازه خوانده می‌شود (تغییر نقش با refresh بعدی اعمال می‌شود)
    const user = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.user.findUnique({ where: { id: outcome.userId }, select: { id: true, role: true, status: true, mfaEnabledAt: true } }),
    );
    if (!user || user.status !== "ACTIVE") throw new UnauthorizedException({ error: "invalid_refresh" });
    return this.createSession(user.id, user.role, outcome.familyId, meta, "auth.refresh", user.mfaEnabledAt !== null);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const familyId = await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const s = await tx.session.findUnique({ where: { refreshTokenHash: hashRefreshToken(rawToken) } });
      if (!s) return null;
      await tx.session.updateMany({ where: { familyId: s.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.logIn(tx, { actorId: s.userId, action: "auth.logout", objectType: "session", objectId: s.familyId });
      return s.familyId;
    });
    if (familyId) await this.revocation.revokeSession(familyId); // access token ی همین نشست دیگر پذیرفته نمی‌شود
  }

  async logoutAll(userId: string, role: Role): Promise<void> {
    await this.prisma.withContext({ role, userId }, async (tx) => {
      await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.logIn(tx, { actorId: userId, actorRole: role, action: "auth.logout_all", objectType: "user", objectId: userId });
    });
    await this.revocation.revokeUser(userId);
  }

  /** تعلیق/حذف کاربر: همه‌ی نشست‌های DB و همه‌ی access token های صادرشده «همین حالا» باطل می‌شوند. */
  async revokeAllSessionsOf(userId: string): Promise<void> {
    await this.prisma.withContext({ role: "SYSTEM" }, (tx) => tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }));
    await this.revocation.revokeUser(userId);
  }

  /** فقط ابطال access token ها (refresh سالم می‌ماند): برای تغییر نقش؛ کلاینت با refresh بعدی توکنِ نقش جدید می‌گیرد. */
  async invalidateAccessTokensOf(userId: string): Promise<void> {
    await this.revocation.revokeUser(userId);
  }

  // ───────────── داخلی ─────────────

  private ipHash(ip: string): string {
    return this.crypto.blindIndex(ip, "ip");
  }

  private async findOrCreateUser(phone: string) {
    const phoneHash = this.crypto.blindIndex(phone, "phone");
    const select = { id: true, role: true, status: true, mfaEnabledAt: true } as const;
    const find = () => this.prisma.withContext({ role: "SYSTEM" }, (tx) => tx.user.findUnique({ where: { phoneHash }, select }));

    const existing = await find();
    if (existing) return existing;

    const id = randomUUID();
    try {
      return await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
        const u = await tx.user.create({
          data: { id, role: "PATIENT", phoneHash, phoneEnc: this.crypto.encrypt(phone, aad("users", id, "phone")) },
          select,
        });
        await tx.patientProfile.create({ data: { userId: id, fullName: "" } });
        await this.audit.logIn(tx, { actorId: id, actorRole: "PATIENT", action: "user.registered", objectType: "user", objectId: id });
        return u;
      });
    } catch (e) {
      // ورود هم‌زمان اول با همین شماره: دیگری ساخته است
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const again = await find();
        if (again) return again;
      }
      throw e;
    }
  }

  /** صدور نشست برای مسیرهای ورود جایگزین (Passkey) پس از احراز هویت کامل. */
  async issueTokensForUser(userId: string, meta: RequestMeta): Promise<Tokens> {
    const user = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.user.findUnique({ where: { id: userId }, select: { role: true, status: true } }),
    );
    if (!user || user.status !== "ACTIVE") throw new UnauthorizedException({ error: "inactive_user" });
    return this.createSession(userId, user.role, randomUUID(), meta, "auth.passkey_login");
  }

  private async createSession(userId: string, role: Role, familyId: string, meta: RequestMeta, action: string, mfa = false): Promise<Tokens> {
    const { token, hash } = generateRefreshToken();
    const maxAgeMs = this.cfg.refreshTtlDays * 86_400_000;
    await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      await tx.session.create({
        data: {
          userId,
          familyId,
          refreshTokenHash: hash,
          userAgent: meta.userAgent?.slice(0, 200),
          ipHash: this.ipHash(meta.ip),
          expiresAt: new Date(Date.now() + maxAgeMs),
        },
      });
      await this.audit.logIn(tx, { actorId: userId, actorRole: role, action, objectType: "session", objectId: familyId });
    });
    const access = await this.tokens.signAccess({ sub: userId, role, sid: familyId, mfa });
    return { accessToken: access.token, expiresInSec: access.expiresInSec, refreshToken: token, refreshMaxAgeMs: maxAgeMs };
  }
}
