import { Global, Module } from "@nestjs/common";
import { AUTH_CONFIG, AuthConfig } from "../config/auth.config";
import { ConsoleSmsProvider, KavenegarSmsProvider, MemorySmsProvider, SMS_PROVIDER } from "./sms.provider";

@Global()
@Module({
  providers: [
    {
      provide: SMS_PROVIDER,
      inject: [AUTH_CONFIG],
      useFactory: (cfg: AuthConfig) =>
        cfg.smsProvider === "kavenegar"
          ? new KavenegarSmsProvider(cfg.kavenegarApiKey!, cfg.kavenegarTemplate!)
          : cfg.smsProvider === "memory"
            ? new MemorySmsProvider()
            : new ConsoleSmsProvider(),
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
