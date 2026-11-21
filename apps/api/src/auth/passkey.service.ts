import { ConflictException, Inject, Injectable, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, AuthenticatorTransportFuture, RegistrationResponseJSON } from "@simplewebauthn/types";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../common/decorators";
import { PrismaService } from "../prisma/prisma.service";
import { KV_STORE, KeyValueStore } from "../redis/kv-store";
import { ChallengeStore, readChallenge, webauthnConfig } from "./passkey-challenge";
import { RateLimiter } from "./rate-limit";

/**
 * A24: Passkey/WebAuthn — ورود بدون رمز مکمل OTP.
 * چالشها کوتاهعمر و یکبارمصرفاند؛ در استقرار چندنمونهای با Redis جایگزین شوند.
 */
@Injectable()
export class PasskeyService {
  private readonly log = new Logger(PasskeyService.name);
  private readonly challenges = new ChallengeStore();
  private readonly limiter: RateLimiter;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(KV_STORE) kv: KeyValueStore,
  ) {
    this.limiter = new RateLimiter(kv);
  }

  /** دامنهٔ واقعی بهصورت خودکار استنتاج میشود و قابل تست مستقل است. */
  private get webauthn() {
    return webauthnConfig(process.env);
  }

  private get origin(): string {
    return this.webauthn.origin;
  }

  private get rpID(): string {
    return this.webauthn.rpID;
  }

  async registrationOptions(u: AuthUser) {
    const existing = await this.prisma.withContext({ role: u.role, userId: u.id }, (tx) =>
      tx.webAuthnCredential.findMany({ where: { userId: u.id }, select: { credentialId: true, transports: true } }),
    );
    const options = await generateRegistrationOptions({
      rpName: "نوبت‌یار",
      rpID: this.rpID,
      userID: Buffer.from(u.id.replace(/-/g, ""), "hex"),
      userName: u.id,
      userDisplayName: "کاربر نوبت‌یار",
      attestationType: "none",
      excludeCredentials: existing.map((c) => ({
        id: c.credentialId,
        transports: c.transports ? (c.transports.split(",") as AuthenticatorTransportFuture[]) : undefined,
      })),
      authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
    });
    this.challenges.remember(options.challenge, u.id);
    return options;
  }

  async verifyRegistration(u: AuthUser, response: RegistrationResponseJSON) {
    const challenge = readChallenge(response.response.clientDataJSON);
    this.challenges.take(challenge, u.id);

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        requireUserVerification: false,
      });
    } catch (e) {
      this.log.warn(`passkey registration failed: ${(e as Error).message}`);
      throw new UnauthorizedException({ error: "passkey_verification_failed" });
    }
    const info = verification.registrationInfo;
    if (!verification.verified || !info) throw new UnauthorizedException({ error: "passkey_verification_failed" });

    const { credentialID, credentialPublicKey, credentialDeviceType, credentialBackedUp } = info;
    await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      const exists = await tx.webAuthnCredential.findUnique({ where: { credentialId: credentialID }, select: { id: true } });
      if (exists) throw new ConflictException({ error: "credential_exists" });
      await tx.webAuthnCredential.create({
        data: {
          userId: u.id,
          credentialId: credentialID,
          publicKey: Buffer.from(credentialPublicKey),
          counter: BigInt(info.counter),
          transports: response.response.transports?.join(",") ?? null,
          deviceType: credentialDeviceType,
          backedUp: credentialBackedUp,
        },
      });
      await this.audit.logIn(tx, {
        actorId: u.id,
        actorRole: u.role,
        action: "auth.passkey_registered",
        objectType: "webauthn_credential",
        objectId: credentialID,
      });
    });
    return { verified: true as const };
  }

  async authenticationOptions(ip: string) {
    const r = await this.limiter.hit(`passkey:options:${ip}`, 60, 300);
    if (!r.allowed) throw new UnauthorizedException({ error: "too_many_requests", retryAfterSec: r.retryAfterSec });
    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      userVerification: "preferred",
      allowCredentials: [], // کشفپذیر: کاربر انتخاب میکند
    });
    this.challenges.remember(options.challenge, null);
    return options;
  }

  /** خروجی: userId تأییدشده؛ توکنها توسط AuthService صادر میشوند. */
  async verifyAuthentication(response: AuthenticationResponseJSON, ip: string): Promise<string> {
    const r = await this.limiter.hit(`passkey:verify:${ip}`, 20, 300);
    if (!r.allowed) throw new UnauthorizedException({ error: "too_many_requests", retryAfterSec: r.retryAfterSec });

    const challenge = readChallenge(response.response.clientDataJSON);
    this.challenges.take(challenge);

    const cred = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.webAuthnCredential.findUnique({ where: { credentialId: response.id } }),
    );
    if (!cred) throw new UnauthorizedException({ error: "credential_not_found" });

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        requireUserVerification: false,
        authenticator: {
          credentialID: cred.credentialId,
          credentialPublicKey: new Uint8Array(cred.publicKey),
          counter: Number(cred.counter),
          transports: cred.transports ? (cred.transports.split(",") as AuthenticatorTransportFuture[]) : undefined,
        },
      });
    } catch (e) {
      this.log.warn(`passkey auth failed: ${(e as Error).message}`);
      throw new UnauthorizedException({ error: "passkey_verification_failed" });
    }
    if (!verification.verified) throw new UnauthorizedException({ error: "passkey_verification_failed" });

    await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      await tx.webAuthnCredential.update({
        where: { id: cred.id },
        data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date() },
      });
      await this.audit.logIn(tx, {
        actorId: cred.userId,
        actorRole: "SYSTEM",
        action: "auth.passkey_login",
        objectType: "webauthn_credential",
        objectId: cred.credentialId,
      });
    });
    return cred.userId;
  }

  list(u: AuthUser) {
    return this.prisma.withContext({ role: u.role, userId: u.id }, (tx) =>
      tx.webAuthnCredential.findMany({
        where: { userId: u.id },
        select: { id: true, deviceType: true, backedUp: true, createdAt: true, lastUsedAt: true },
        orderBy: { createdAt: "desc" },
      }),
    );
  }

  async remove(u: AuthUser, id: string) {
    const row = await this.prisma.withContext({ role: u.role, userId: u.id }, (tx) =>
      tx.webAuthnCredential.findUnique({ where: { id }, select: { userId: true, credentialId: true } }),
    );
    if (!row || row.userId !== u.id) throw new NotFoundException();
    await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      await tx.webAuthnCredential.delete({ where: { id } });
      await this.audit.logIn(tx, {
        actorId: u.id,
        actorRole: u.role,
        action: "auth.passkey_removed",
        objectType: "webauthn_credential",
        objectId: row.credentialId,
      });
    });
    return { id, removed: true as const };
  }
}
