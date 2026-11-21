export const AUTH_CONFIG = Symbol("AUTH_CONFIG");

export interface AuthConfig {
  isProduction: boolean;
  accessSecret: Buffer;
  accessTtlSec: number;
  refreshTtlDays: number;
  otpSecret: Buffer;
  otpLength: number;
  otpTtlSec: number;
  otpMaxAttempts: number;
  otpLockSec: number;
  otpResendCooldownSec: number;
  otpPerPhoneHourly: number;
  otpPerIpHourly: number;
  otpGlobalDailyCap: number;
  verifyPerIp10Min: number;
  refreshPerIp10Min: number;
  cookieSecure: boolean;
  corsOrigins: string[];
  smsProvider: "console" | "kavenegar" | "memory";
  /** hook های تست E2E (/__e2e/*): فقط غیر production؛ در production وجود آن‌ها خطای راه‌اندازی است. */
  e2eHooks: boolean;
  /** access token بدون sid رد شود (پس از یک عمر access token از استقرار، true؛ پیش‌فرض true) */
  requireSid: boolean;
  /** Redis ی ابطال در دسترس نیست: true ⇒ اجازه. در production ممنوع (fail-closed). */
  sessionCheckFailOpen: boolean;
  /**
   * فاز ۲۰ (A1): اعمالpolicy بهصورت opt-in است تا استقرارfirst-time ادمینها قفل نشود.
   * پس از ثبت راز توسط حداقل ۲ ادمین، ADMIN_REQUIRE_MFA=true تنظیم شود (پیشنهاد preflight).
   */
  adminRequireMfa: boolean;
  kavenegarApiKey?: string;
  kavenegarTemplate?: string;
}

const nonNegativeInt = (v: string | undefined, d: number, name: string): number => {
  if (v === undefined || v === "") return d;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a non-negative integer`);
  return n;
};

const int = (v: string | undefined, d: number, name: string): number => {
  if (v === undefined || v === "") return d;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer`);
  return n;
};

const secret = (v: string | undefined, name: string): Buffer => {
  const b = Buffer.from(v ?? "", "base64");
  if (b.length < 32) throw new Error(`${name} must be at least 32 bytes (base64) — see scripts/gen-keys.mjs`);
  return b;
};

export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const isProduction = env.NODE_ENV === "production";
  const smsProvider = (env.SMS_PROVIDER ?? "console") as AuthConfig["smsProvider"];
  if (smsProvider !== "console" && smsProvider !== "kavenegar" && smsProvider !== "memory") throw new Error("SMS_PROVIDER must be 'console', 'kavenegar' or 'memory'");
  if (isProduction && (smsProvider === "console" || smsProvider === "memory")) throw new Error(`SMS_PROVIDER=${smsProvider} is not allowed in production`);
  const e2eHooks = env.E2E_TEST_HOOKS === "true";
  if (env.E2E_TEST_HOOKS && env.E2E_TEST_HOOKS !== "true" && env.E2E_TEST_HOOKS !== "false") throw new Error('E2E_TEST_HOOKS must be exactly "true" or "false"');
  if (isProduction && e2eHooks) throw new Error("E2E_TEST_HOOKS=true is not allowed in production (fail-closed)");
  if (e2eHooks && smsProvider !== "memory") throw new Error("E2E_TEST_HOOKS=true requires SMS_PROVIDER=memory");
  if (smsProvider === "kavenegar" && (!env.KAVENEGAR_API_KEY || !env.KAVENEGAR_TEMPLATE)) {
    throw new Error("KAVENEGAR_API_KEY and KAVENEGAR_TEMPLATE are required for SMS_PROVIDER=kavenegar");
  }
  const otpLength = int(env.OTP_LENGTH, 6, "OTP_LENGTH");
  if (otpLength < 6 || otpLength > 8) throw new Error("OTP_LENGTH must be between 6 and 8");

  const bool = (v: string | undefined, d: boolean, name: string): boolean => {
    if (v === undefined || v === "") return d;
    if (v !== "true" && v !== "false") throw new Error(`${name} must be exactly "true" or "false"`);
    return v === "true";
  };
  const sessionCheckFailOpen = bool(env.SESSION_CHECK_FAIL_OPEN, false, "SESSION_CHECK_FAIL_OPEN");
  if (isProduction && sessionCheckFailOpen) throw new Error("SESSION_CHECK_FAIL_OPEN=true is not allowed in production (fail-closed)");

  return {
    isProduction,
    accessSecret: secret(env.JWT_ACCESS_SECRET, "JWT_ACCESS_SECRET"),
    accessTtlSec: int(env.ACCESS_TTL_SEC, 900, "ACCESS_TTL_SEC"),
    refreshTtlDays: int(env.REFRESH_TTL_DAYS, 30, "REFRESH_TTL_DAYS"),
    otpSecret: secret(env.OTP_SECRET, "OTP_SECRET"),
    otpLength,
    otpTtlSec: int(env.OTP_TTL_SEC, 120, "OTP_TTL_SEC"),
    otpMaxAttempts: int(env.OTP_MAX_ATTEMPTS, 5, "OTP_MAX_ATTEMPTS"),
    otpLockSec: int(env.OTP_LOCK_SEC, 900, "OTP_LOCK_SEC"),
    otpResendCooldownSec: nonNegativeInt(env.OTP_RESEND_COOLDOWN_SEC, 60, "OTP_RESEND_COOLDOWN_SEC"),
    otpPerPhoneHourly: int(env.OTP_PER_PHONE_HOURLY, 5, "OTP_PER_PHONE_HOURLY"),
    otpPerIpHourly: int(env.OTP_PER_IP_HOURLY, 20, "OTP_PER_IP_HOURLY"),
    otpGlobalDailyCap: int(env.OTP_GLOBAL_DAILY_CAP, 5000, "OTP_GLOBAL_DAILY_CAP"),
    verifyPerIp10Min: int(env.VERIFY_PER_IP_10MIN, 30, "VERIFY_PER_IP_10MIN"),
    refreshPerIp10Min: int(env.REFRESH_PER_IP_10MIN, 60, "REFRESH_PER_IP_10MIN"),
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === "true" : isProduction,
    corsOrigins: (env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    smsProvider,
    e2eHooks,
    requireSid: bool(env.ACCESS_REQUIRE_SID, true, "ACCESS_REQUIRE_SID"),
    sessionCheckFailOpen,
    adminRequireMfa: bool(env.ADMIN_REQUIRE_MFA, false, "ADMIN_REQUIRE_MFA"),
    kavenegarApiKey: env.KAVENEGAR_API_KEY,
    kavenegarTemplate: env.KAVENEGAR_TEMPLATE,
  };
}
