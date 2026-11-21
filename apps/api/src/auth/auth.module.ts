import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AUTH_CONFIG, AuthConfig } from "../config/auth.config";
import { KV_STORE, KeyValueStore } from "../redis/kv-store";
import { SMS_PROVIDER, SmsProvider } from "../sms/sms.provider";
import { AuthController } from "./auth.controller";
import { DemoController } from "./demo.controller";
import { AuthService } from "./auth.service";
import { ConsentGuard, JwtAuthGuard, RolesGuard } from "./guards";
import { MfaController } from "./mfa.controller";
import { MfaGuard } from "./mfa.guard";
import { MfaService } from "./mfa.service";
import { OtpService } from "./otp.service";
import { PasskeyController } from "./passkey.controller";
import { PasskeyService } from "./passkey.service";
import { SessionRevocation } from "./session-revocation";
import { TokenService } from "./token.service";

@Global()
@Module({
  controllers: [AuthController, MfaController, PasskeyController, DemoController],
  providers: [
    {
      provide: OtpService,
      inject: [KV_STORE, SMS_PROVIDER, AUTH_CONFIG],
      useFactory: (kv: KeyValueStore, sms: SmsProvider, cfg: AuthConfig) => new OtpService(kv, sms, cfg),
    },
    { provide: TokenService, inject: [AUTH_CONFIG], useFactory: (cfg: AuthConfig) => new TokenService(cfg) },
    {
      // TTL = عمر access token + حاشیه؛ بعد از آن خودِ توکن منقضی است و کلید بی‌اثر
      provide: SessionRevocation,
      inject: [KV_STORE, AUTH_CONFIG],
      useFactory: (kv: KeyValueStore, cfg: AuthConfig) =>
        new SessionRevocation(kv, cfg.accessTtlSec + 60, { requireSid: cfg.requireSid }, cfg.sessionCheckFailOpen),
    },
    AuthService,
    MfaService,
    PasskeyService,
    // ترتیب مهم است: ابتدا احراز هویت، سپس نقش، سپس MFA، سپس رضایت
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: MfaGuard },
    { provide: APP_GUARD, useClass: ConsentGuard },
  ],
  exports: [TokenService, AuthService, SessionRevocation, MfaService, PasskeyService],
})
export class AuthModule {}
