import { ConflictException, Inject, Injectable, ForbiddenException, UnauthorizedException, UnprocessableEntityException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../common/decorators";
import { AUTH_CONFIG, type AuthConfig } from "../config/auth.config";
import { aad, FIELD_CRYPTO, type FieldCrypto } from "../crypto";
import { PrismaService } from "../prisma/prisma.service";
import { TokenService } from "./token.service";
import {
  generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, otpauthUri, verifyTotp, base32Decode,
} from "./totp";

const MFA_MAX_ATTEMPTS = 5;
const MFA_LOCK_MS = 15 * 60_000;

export interface MfaStatus {
  enabled: boolean;
  /** با ADMIN_REQUIRE_MFA=true برای ادمینها الزامی است */
  required: boolean;
  enrolledAt: string | null;
  recoveryCodesLeft: number;
}

@Injectable()
export class MfaService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(AUTH_CONFIG) private readonly cfg: AuthConfig,
  ) {}

  private async row(userId: string) {
    const u = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, mfaSecretEnc: true, mfaEnabledAt: true, mfaRecoveryHash: true, mfaFailedCount: true, mfaLockedUntil: true },
      }),
    );
    if (!u) throw new UnauthorizedException({ error: "unauthorized" });
    return u;
  }

  status(userId: string): Promise<MfaStatus> {
    return this.row(userId).then((u) => ({
      enabled: u.mfaEnabledAt !== null,
      required: this.cfg.adminRequireMfa && u.role === "ADMIN",
      enrolledAt: u.mfaEnabledAt?.toISOString() ?? null,
      recoveryCodesLeft: u.mfaRecoveryHash ? (JSON.parse(u.mfaRecoveryHash) as string[]).length : 0,
    }));
  }

  /** ساخت راز و کدهای پشتیبان — «پیش» از تأیید، حساب همچنان بدون MFA است. */
  async enroll(u: AuthUser) {
    const current = await this.row(u.id);
    // A2: بازنویسی راز یک حساب فعال باعث قفل خودکار ادمین میشود.
    if (current.mfaEnabledAt) throw new ConflictException({ error: "mfa_already_enabled", message: "mfa_already_enabled" });
    const secret = generateTotpSecret();
    const recovery = generateRecoveryCodes();
    await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      await tx.user.update({
        where: { id: u.id },
        data: {
          mfaSecretEnc: this.crypto.encrypt(secret, aad("users", u.id, "mfa_secret")),
          mfaRecoveryHash: JSON.stringify(recovery.map(hashRecoveryCode)),
          mfaFailedCount: 0,
          mfaLockedUntil: null,
        },
      });
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "auth.mfa_enroll_started", objectType: "user", objectId: u.id });
    });
    // راز و کدها «فقط یک بار» به کلاینت داده میشود؛ دوباره قابل خواندن نیست.
    return {
      secret,
      uri: otpauthUri(secret, "نوبتیار", u.id),
      recoveryCodes: recovery,
    };
  }

  /** فعالسازی با کد معتبر TOTP؛ access token تازه با claim ی mfa صادر میشود. */
  async enable(u: AuthUser, code: string, sid?: string) {
    const row = await this.row(u.id);
    if (!row.mfaSecretEnc) throw new UnprocessableEntityException({ error: "mfa_not_enrolled" });
    this.assertNotLocked(row.mfaLockedUntil, row.mfaFailedCount);
    const secret = base32Decode(this.crypto.decryptString(row.mfaSecretEnc, aad("users", u.id, "mfa_secret")));
    if (!verifyTotp(secret, code, Date.now())) {
      await this.fail(u, row.mfaFailedCount);
      throw new UnprocessableEntityException({ error: "mfa_invalid_code" });
    }
    const at = new Date();
    await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      await tx.user.update({ where: { id: u.id }, data: { mfaEnabledAt: at, mfaFailedCount: 0, mfaLockedUntil: null } });
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "auth.mfa_enabled", objectType: "user", objectId: u.id });
    });
    return { accessToken: (await this.sign(u, sid)).token };
  }

  /**
   * A2: چرخش امن راز برای حساب فعال — تنها با کد فعلی معتبر.
   * وضعیت `enabled` دستنخورده میماند و راز جدید تنها پس از تأیید جایگزین میشود.
   */
  async rotate(u: AuthUser, currentCode: string) {
    const row = await this.row(u.id);
    if (!row.mfaEnabledAt || !row.mfaSecretEnc) throw new ForbiddenException({ error: "mfa_not_enabled" });
    this.assertNotLocked(row.mfaLockedUntil, row.mfaFailedCount);
    const secret = base32Decode(this.crypto.decryptString(row.mfaSecretEnc, aad("users", u.id, "mfa_secret")));
    if (!verifyTotp(secret, currentCode, Date.now())) return this.failAndThrow(u, row.mfaFailedCount);
    const next = generateTotpSecret();
    const recovery = generateRecoveryCodes();
    await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      await tx.user.update({
        where: { id: u.id },
        data: {
          mfaSecretEnc: this.crypto.encrypt(next, aad("users", u.id, "mfa_secret")),
          mfaRecoveryHash: JSON.stringify(recovery.map(hashRecoveryCode)),
          mfaFailedCount: 0, mfaLockedUntil: null,
        },
      });
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "auth.mfa_rotated", objectType: "user", objectId: u.id });
    });
    return { secret: next, uri: otpauthUri(next, "نوبتیار", u.id), recoveryCodes: recovery };
  }

  /** تأیید step-up برای کاربری که MFA دارد ولی توکن فعلیاش فاقد claim است. */
  async verify(u: AuthUser, code: string, sid?: string) {
    const row = await this.row(u.id);
    if (!row.mfaEnabledAt || !row.mfaSecretEnc) throw new ForbiddenException({ error: "mfa_not_enabled" });
    this.assertNotLocked(row.mfaLockedUntil, row.mfaFailedCount);
    const secret = base32Decode(this.crypto.decryptString(row.mfaSecretEnc, aad("users", u.id, "mfa_secret")));
    if (verifyTotp(secret, code, Date.now())) return this.success(u, row.mfaFailedCount, sid);
    // کد پشتیبان تکبارمصرف
    const codeHash = hashRecoveryCode(code);
    const hashes = row.mfaRecoveryHash ? (JSON.parse(row.mfaRecoveryHash) as string[]) : [];
    const idx = hashes.indexOf(codeHash);
    if (idx === -1) return this.failAndThrow(u, row.mfaFailedCount);
    hashes.splice(idx, 1); // مصرفشده ⇒ نمیتوان دوباره استفاده کرد
    await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      await tx.user.update({ where: { id: u.id }, data: { mfaRecoveryHash: JSON.stringify(hashes) } });
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "auth.mfa_recovery_used", objectType: "user", objectId: u.id, meta: { left: hashes.length } });
    });
    return this.success(u, row.mfaFailedCount, sid);
  }

  async disable(u: AuthUser, code: string) {
    const row = await this.row(u.id);
    if (!row.mfaEnabledAt || !row.mfaSecretEnc) throw new ForbiddenException({ error: "mfa_not_enabled" });
    this.assertNotLocked(row.mfaLockedUntil, row.mfaFailedCount);
    const secret = base32Decode(this.crypto.decryptString(row.mfaSecretEnc, aad("users", u.id, "mfa_secret")));
    if (!verifyTotp(secret, code, Date.now()) && !row.mfaRecoveryHash?.includes(hashRecoveryCode(code))) {
      return this.failAndThrow(u, row.mfaFailedCount);
    }
    if (this.cfg.adminRequireMfa && row.role === "ADMIN") throw new ForbiddenException({ error: "mfa_required_by_policy" });
    await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      await tx.user.update({
        where: { id: u.id },
        data: { mfaSecretEnc: null, mfaEnabledAt: null, mfaRecoveryHash: null, mfaFailedCount: 0, mfaLockedUntil: null },
      });
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "auth.mfa_disabled", objectType: "user", objectId: u.id });
    });
    return { disabled: true };
  }

  private async sign(u: AuthUser, sid?: string) {
    return this.tokens.signAccess({ sub: u.id, role: u.role, sid, mfa: true });
  }

  private async success(u: AuthUser, failedCount: number, sid?: string) {
    if (failedCount > 0) {
      await this.prisma.withContext({ role: "SYSTEM" }, (tx) => tx.user.update({ where: { id: u.id }, data: { mfaFailedCount: 0, mfaLockedUntil: null } }));
    }
    await this.audit.log({ actorId: u.id, actorRole: u.role, action: "auth.mfa_verified", objectType: "user", objectId: u.id });
    return { verified: true, accessToken: (await this.sign(u, sid)).token };
  }

  private async failAndThrow(u: AuthUser, failedCount: number): Promise<never> {
    await this.fail(u, failedCount);
    throw new UnprocessableEntityException({ error: "mfa_invalid_code" });
  }

  private async fail(u: AuthUser, failedCount: number) {
    const n = failedCount + 1;
    await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.user.update({
        where: { id: u.id },
        data: n >= MFA_MAX_ATTEMPTS
          ? { mfaFailedCount: n, mfaLockedUntil: new Date(Date.now() + MFA_LOCK_MS) }
          : { mfaFailedCount: n },
      }),
    );
  }

  private assertNotLocked(lockedUntil: Date | null, failed: number) {
    if (lockedUntil && lockedUntil.getTime() > Date.now()) {
      throw new UnprocessableEntityException({ error: "mfa_locked", retryAfterSec: Math.ceil((lockedUntil.getTime() - Date.now()) / 1000) });
    }
    if (lockedUntil && lockedUntil.getTime() <= Date.now() && failed >= MFA_MAX_ATTEMPTS) {
      // قفل منقضی شده ⇒ شمارنده ریست میشود (در تلاش بعدی نوشته میشود)
      return;
    }
  }
}
