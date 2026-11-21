import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { AuthConfig } from "../config/auth.config";
import type { KeyValueStore } from "../redis/kv-store";
import type { SmsProvider } from "../sms/sms.provider";
import { RateLimiter } from "./rate-limit";

export type OtpRequestResult =
  | { ok: true }
  | { ok: false; reason: "cooldown" | "rate_limited"; retryAfterSec: number };

export type OtpVerifyResult = { ok: true } | { ok: false; reason: "invalid" | "locked"; retryAfterSec?: number };

type OtpCfg = Pick<
  AuthConfig,
  | "otpSecret" | "otpLength" | "otpTtlSec" | "otpMaxAttempts" | "otpLockSec"
  | "otpResendCooldownSec" | "otpPerPhoneHourly" | "otpPerIpHourly" | "otpGlobalDailyCap"
>;

/**
 * OTP پیامکی.
 *  - کد فقط به‌صورت HMAC (با phone) در KV می‌ماند؛ کلیدهای KV از موبایل خام ساخته نمی‌شوند.
 *  - ضد SMS-pumping: cooldown هر شماره، سقف ساعتی هر شماره و هر IP، سقف روزانه‌ی کل.
 *  - ضد brute-force: حداکثر N حدس؛ سپس کد باطل و شماره موقتاً قفل می‌شود.
 *  - مصرف یک‌بار: تطبیق موفق با del اتمیک تأیید می‌شود (verify هم‌زمان با همان کد فقط یک‌بار موفق است).
 */
export class OtpService {
  private readonly limiter: RateLimiter;

  constructor(
    private readonly kv: KeyValueStore,
    private readonly sms: SmsProvider,
    private readonly cfg: OtpCfg,
    private readonly now: () => Date = () => new Date(),
    private readonly randomCode: (digits: number) => string = defaultCode,
  ) {
    this.limiter = new RateLimiter(kv);
  }

  private k(phone: string): string {
    return createHmac("sha256", this.cfg.otpSecret).update(`key|${phone}`).digest("hex").slice(0, 32);
  }

  private codeMac(phone: string, code: string): Buffer {
    return createHmac("sha256", this.cfg.otpSecret).update(`code|${phone}|${code}`).digest();
  }

  async request(phone: string, ip: string): Promise<OtpRequestResult> {
    const c = this.cfg;
    const pk = this.k(phone);

    const cd = await this.kv.ttl(`otp:cd:${pk}`);
    if (cd > 0) return { ok: false, reason: "cooldown", retryAfterSec: cd };

    const day = this.now().toISOString().slice(0, 10);
    const g = await this.limiter.hit(`otp:global:${day}`, c.otpGlobalDailyCap, 86_400);
    if (!g.allowed) return { ok: false, reason: "rate_limited", retryAfterSec: g.retryAfterSec };

    const byPhone = await this.limiter.hit(`otp:phone:${pk}`, c.otpPerPhoneHourly, 3600);
    if (!byPhone.allowed) return { ok: false, reason: "rate_limited", retryAfterSec: byPhone.retryAfterSec };

    const byIp = await this.limiter.hit(`otp:ip:${ip}`, c.otpPerIpHourly, 3600);
    if (!byIp.allowed) return { ok: false, reason: "rate_limited", retryAfterSec: byIp.retryAfterSec };

    const code = this.randomCode(c.otpLength);
    await this.kv.set(`otp:code:${pk}`, this.codeMac(phone, code).toString("hex"), c.otpTtlSec);
    await this.kv.del(`otp:attempts:${pk}`);
    if (c.otpResendCooldownSec > 0) await this.kv.set(`otp:cd:${pk}`, "1", c.otpResendCooldownSec);

    try {
      await this.sms.sendOtp(phone, code);
    } catch (e) {
      // ارسال نشد ⇒ کد بی‌مصرف است؛ cooldown را هم برمی‌داریم تا کاربر بتواند دوباره تلاش کند
      await this.kv.del(`otp:code:${pk}`);
      await this.kv.del(`otp:cd:${pk}`);
      throw e;
    }
    return { ok: true };
  }

  async verify(phone: string, code: string): Promise<OtpVerifyResult> {
    const c = this.cfg;
    const pk = this.k(phone);

    const lock = await this.kv.ttl(`otp:lock:${pk}`);
    if (lock > 0) return { ok: false, reason: "locked", retryAfterSec: lock };

    const stored = await this.kv.get(`otp:code:${pk}`);
    if (!stored) return { ok: false, reason: "invalid" }; // منقضی/ناموجود: عمداً یکسان

    const expected = Buffer.from(stored, "hex");
    const given = this.codeMac(phone, code);
    const match = expected.length === given.length && timingSafeEqual(expected, given);

    if (match) {
      // فقط اگر ما کلید را حذف کردیم موفق است ⇒ مصرف یک‌بار حتی با درخواست‌های هم‌زمان
      if ((await this.kv.del(`otp:code:${pk}`)) === 1) {
        await this.kv.del(`otp:attempts:${pk}`);
        return { ok: true };
      }
      return { ok: false, reason: "invalid" };
    }

    const attempts = await this.kv.incr(`otp:attempts:${pk}`, c.otpTtlSec + 60);
    if (attempts >= c.otpMaxAttempts) {
      await this.kv.del(`otp:code:${pk}`);
      await this.kv.set(`otp:lock:${pk}`, "1", c.otpLockSec);
      return { ok: false, reason: "locked", retryAfterSec: c.otpLockSec };
    }
    return { ok: false, reason: "invalid" };
  }
}

function defaultCode(digits: number): string {
  return String(randomInt(0, 10 ** digits)).padStart(digits, "0");
}
