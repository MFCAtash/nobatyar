export const SMS_PROVIDER = Symbol("SMS_PROVIDER");

export interface SmsProvider {
  /** ارسال کد تأیید. phone به قالب 989XXXXXXXXX. در خطا throw می‌کند. */
  sendOtp(phone: string, code: string): Promise<void>;
}

/** فقط توسعه — کد را در لاگ چاپ می‌کند. در production توسط loadAuthConfig ممنوع است. */
export class ConsoleSmsProvider implements SmsProvider {
  async sendOtp(phone: string, code: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.warn(`[DEV SMS] OTP for ***${phone.slice(-4)}: ${code}`);
  }
}

/**
 * فقط تست E2E/بار — آخرین کد هر شماره را در حافظه نگه می‌دارد تا hook ی /__e2e/otp بخواند.
 * در production توسط loadAuthConfig ممنوع است و controller ی خواننده هم فقط با E2E_TEST_HOOKS ساخته می‌شود.
 */
export class MemorySmsProvider implements SmsProvider {
  private readonly codes = new Map<string, string>();
  async sendOtp(phone: string, code: string): Promise<void> {
    if (process.env.NODE_ENV === "production") throw new Error("MemorySmsProvider is forbidden in production");
    this.codes.set(phone, code);
  }
  /** خواندنِ «یک‌بارمصرف»: بعد از خواندن پاک می‌شود. */
  take(phone: string): string | undefined {
    const c = this.codes.get(phone);
    this.codes.delete(phone);
    return c;
  }
}

/**
 * کاوه‌نگار (verify/lookup). ⚠️ پیش از استفاده نام پارامترها و قالب را با مستندات فعلی سرویس تطبیق دهید.
 * کلید API در URL است ⇒ URL را هرگز لاگ نکنید.
 */
export class KavenegarSmsProvider implements SmsProvider {
  constructor(private apiKey: string, private template: string, private timeoutMs = 5000) {}

  async sendOtp(phone: string, code: string): Promise<void> {
    const receptor = `0${phone.slice(2)}`; // 98912... → 0912...
    const url =
      `https://api.kavenegar.com/v1/${encodeURIComponent(this.apiKey)}/verify/lookup.json` +
      `?receptor=${encodeURIComponent(receptor)}&token=${encodeURIComponent(code)}&template=${encodeURIComponent(this.template)}`;
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    } catch {
      throw new Error("sms provider unreachable");
    }
    if (!res.ok) throw new Error(`sms provider error (status ${res.status})`);
  }
}
