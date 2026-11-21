import { GATEWAY_NAMES } from "./gateway/gateway";
import type { GatewayName, RealGatewayName } from "./gateway/gateway";
import type { IdpayConfig } from "./gateway/idpay.gateway";
import type { SandboxMode } from "./gateway/sandbox.gateway";
import { ZIBAL_TEST_MERCHANT } from "./gateway/zibal.gateway";
import type { ZibalConfig } from "./gateway/zibal.gateway";
import type { ZarinpalConfig } from "./gateway/zarinpal.gateway";

export const PAYMENT_CONFIG = Symbol("PAYMENT_CONFIG");

export interface PaymentConfig {
  isProduction: boolean;
  /** درگاه اصلی (برای request ی جدید). */
  primary: GatewayName;
  /** درگاه‌های جایگزین به‌ترتیب اولویت — فقط وقتی اصلی «در دسترس نیست». */
  fallbacks: RealGatewayName[];
  zarinpal?: ZarinpalConfig;
  zibal?: ZibalConfig;
  idpay?: IdpayConfig;
  sandboxMode: SandboxMode;
  allowedCallbackOrigins: string[];
  /** مبدأ پیش‌فرض callback وقتی کلاینت چیزی نفرستد. */
  defaultCallbackOrigin?: string;
  httpTimeoutMs: number;
  /** پرداخت INITIATED قدیمی‌تر از این (دقیقه) را job از درگاه استعلام می‌کند. */
  reconcileAfterMin: number;
  reconcileEverySec: number;
  /** پس از این مدت، تلاشی که درگاه «پرداخت‌نشده» می‌گوید EXPIRED می‌شود. */
  attemptGiveUpHours: number;
  /** هنگام شروع پرداخت، نگه‌داشتن اسلات تا این مدت (دقیقه) تمدید می‌شود. */
  paymentHoldMin: number;
  breakerFailures: number;
  breakerCooldownSec: number;
  /** سقف درخواست initiate/verify برای هر کاربر در دقیقه (جلوگیری از تقویت فراخوانی به درگاه). */
  ratePerUserPerMin: number;
  /** تأیید دو نفره‌ی استرداد (Maker/Checker). پیش‌فرض روشن؛ با یک ادمین کار نمی‌کند ⇒ حداقل دو ادمین لازم است. */
  refundDualApproval: boolean;
  /** مبالغ کمتر از این (ریال) بدون تأیید دوم اجرا می‌شوند؛ پیش‌فرض ۰ = همه تأیید می‌خواهند. */
  refundDualApprovalMinRial: bigint;
}

const SANDBOX_FLAGS = ["ZARINPAL_SANDBOX", "ZIBAL_SANDBOX", "IDPAY_SANDBOX"] as const;

const int = (v: string | undefined, d: number, name: string, min: number, max: number): number => {
  if (v === undefined || v === "") return d;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer in [${min}, ${max}]`);
  return n;
};

/** فقط "true"/"false" (یا خالی = false). مقدارهای مبهم مثل "yes"/"1"/"True" خطاست تا flag ی اشتباه‌خوانده نشود. */
export function parseStrictBool(v: string | undefined, name: string): boolean {
  if (v === undefined || v === "") return false;
  if (v === "true") return true;
  if (v === "false") return false;
  throw new Error(`${name} must be exactly "true" or "false"`);
}

/** مثل parseStrictBool ولی با پیش‌فرض دلخواه (خالی ⇒ default). */
export function parseBoolDefault(v: string | undefined, dflt: boolean, name: string): boolean {
  if (v === undefined || v === "") return dflt;
  return parseStrictBool(v, name);
}

export function parseNonNegativeBigint(v: string | undefined, name: string): bigint {
  if (v === undefined || v === "") return 0n;
  if (!/^\d{1,15}$/.test(v)) throw new Error(`${name} must be a non-negative integer (rial)`);
  return BigInt(v);
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function parseOrigins(raw: string | undefined, isProduction: boolean): string[] {
  const list = (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const o of list) {
    let u: URL;
    try { u = new URL(o); } catch { throw new Error(`ALLOWED_CALLBACK_ORIGINS has an invalid origin: ${o}`); }
    if (u.origin !== o) throw new Error(`ALLOWED_CALLBACK_ORIGINS entries must be bare origins (scheme://host[:port]), got: ${o}`);
    if (isProduction && u.protocol !== "https:") throw new Error(`ALLOWED_CALLBACK_ORIGINS must be https in production, got: ${o}`);
  }
  return list;
}

/**
 * بارگذاریِ fail-closed. هر ناسازگاری ⇒ throw ⇒ اپ بالا نمی‌آید (main.ts پیش از ساخت اپ، و PaymentModule هنگام DI).
 *
 * قواعد production (NODE_ENV=production):
 *  ۱) هر flag سندباکس (ZARINPAL_SANDBOX / ZIBAL_SANDBOX / IDPAY_SANDBOX) روشن باشد ⇒ توقف.
 *  ۲) PAYMENT_GATEWAY=sandbox یا PAYMENT_SANDBOX_MODE تنظیم‌شده ⇒ توقف.
 *  ۳) درگاه اصلی باید «صریحاً» تعیین و مشخصاتش کامل باشد؛ merchant ی آزمایشی Zibal ممنوع است.
 *  ۴) ALLOWED_CALLBACK_ORIGINS الزامی و فقط https (جلوگیری از open-redirect/callback جعلی).
 */
export function loadPaymentConfig(env: NodeJS.ProcessEnv = process.env): PaymentConfig {
  const isProduction = env.NODE_ENV === "production";

  const sandboxFlags = {
    zarinpal: parseStrictBool(env.ZARINPAL_SANDBOX, "ZARINPAL_SANDBOX"),
    zibal: parseStrictBool(env.ZIBAL_SANDBOX, "ZIBAL_SANDBOX"),
    idpay: parseStrictBool(env.IDPAY_SANDBOX, "IDPAY_SANDBOX"),
  };
  if (isProduction) {
    const on = SANDBOX_FLAGS.filter((f) => env[f] === "true");
    if (on.length) throw new Error(`Refusing to start: sandbox flag(s) ${on.join(", ")} are enabled while NODE_ENV=production (fail-closed)`);
    if (env.PAYMENT_SANDBOX_MODE) throw new Error("Refusing to start: PAYMENT_SANDBOX_MODE must not be set in production");
  }

  // ── مشخصات درگاه‌ها ──
  let zarinpal: ZarinpalConfig | undefined;
  if (env.ZARINPAL_MERCHANT_ID) {
    if (!UUID_RE.test(env.ZARINPAL_MERCHANT_ID)) throw new Error("ZARINPAL_MERCHANT_ID must be a 36-character UUID");
    const token = env.ZARINPAL_ACCESS_TOKEN?.trim() || undefined;
    if (token && !/^[A-Za-z0-9._~+/=-]{16,2048}$/.test(token)) throw new Error("ZARINPAL_ACCESS_TOKEN has an invalid format");
    const method = env.ZARINPAL_REFUND_METHOD?.trim() || "PAYA";
    if (method !== "PAYA" && method !== "CARD") throw new Error("ZARINPAL_REFUND_METHOD must be PAYA or CARD");
    const gql = env.ZARINPAL_GRAPHQL_URL?.trim() || undefined;
    if (gql && !/^https:\/\/[^\s]+$/.test(gql)) throw new Error("ZARINPAL_GRAPHQL_URL must be https");
    zarinpal = { merchantId: env.ZARINPAL_MERCHANT_ID, sandbox: sandboxFlags.zarinpal, accessToken: token, refundMethod: method, graphqlUrl: gql };
  }
  let zibal: ZibalConfig | undefined;
  if (env.ZIBAL_MERCHANT) {
    if (!/^[A-Za-z0-9_-]{3,64}$/.test(env.ZIBAL_MERCHANT)) throw new Error("ZIBAL_MERCHANT has an invalid format");
    if (isProduction && env.ZIBAL_MERCHANT.toLowerCase() === ZIBAL_TEST_MERCHANT) {
      throw new Error("Refusing to start: ZIBAL_MERCHANT is the public test merchant while NODE_ENV=production (fail-closed)");
    }
    zibal = { merchant: env.ZIBAL_MERCHANT, sandbox: sandboxFlags.zibal };
  }
  let idpay: IdpayConfig | undefined;
  if (env.IDPAY_API_KEY) {
    if (!/^[A-Za-z0-9-]{16,64}$/.test(env.IDPAY_API_KEY)) throw new Error("IDPAY_API_KEY has an invalid format");
    idpay = { apiKey: env.IDPAY_API_KEY, sandbox: sandboxFlags.idpay };
  }
  const configured: Record<RealGatewayName, boolean> = { zarinpal: !!zarinpal, zibal: !!zibal, idpay: !!idpay };

  // ── درگاه اصلی ──
  const rawPrimary = (env.PAYMENT_GATEWAY ?? "").trim().toLowerCase();
  if (isProduction && !rawPrimary) throw new Error("PAYMENT_GATEWAY is required in production (zarinpal | zibal | idpay)");
  const primary = (rawPrimary || "sandbox") as GatewayName;
  if (primary !== "sandbox" && !(GATEWAY_NAMES as readonly string[]).includes(primary)) {
    throw new Error(`PAYMENT_GATEWAY must be one of: ${GATEWAY_NAMES.join(", ")}${isProduction ? "" : ", sandbox"}`);
  }
  if (primary === "sandbox" && isProduction) throw new Error("Refusing to start: PAYMENT_GATEWAY=sandbox is not allowed in production (fail-closed)");
  if (primary !== "sandbox" && !configured[primary]) {
    throw new Error(`PAYMENT_GATEWAY=${primary} but its credentials are not set (${primary === "zarinpal" ? "ZARINPAL_MERCHANT_ID" : primary === "zibal" ? "ZIBAL_MERCHANT" : "IDPAY_API_KEY"})`);
  }

  // ── جایگزین‌ها (failover) ──
  const fallbacks: RealGatewayName[] = [];
  for (const raw of (env.PAYMENT_FALLBACK_GATEWAYS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
    if (!(GATEWAY_NAMES as readonly string[]).includes(raw)) throw new Error(`PAYMENT_FALLBACK_GATEWAYS: unknown gateway "${raw}"`);
    const g = raw as RealGatewayName;
    if (g === primary) throw new Error(`PAYMENT_FALLBACK_GATEWAYS must not contain the primary gateway (${g})`);
    if (fallbacks.includes(g)) throw new Error(`PAYMENT_FALLBACK_GATEWAYS contains a duplicate: ${g}`);
    if (!configured[g]) throw new Error(`PAYMENT_FALLBACK_GATEWAYS lists ${g} but its credentials are not set`);
    fallbacks.push(g);
  }

  const sandboxMode = (env.PAYMENT_SANDBOX_MODE ?? "success") as SandboxMode;
  if (!["success", "fail", "pending"].includes(sandboxMode)) throw new Error('PAYMENT_SANDBOX_MODE must be "success", "fail" or "pending"');

  // ── مبدأهای callback ──
  const allowedCallbackOrigins = parseOrigins(env.ALLOWED_CALLBACK_ORIGINS, isProduction);
  if (isProduction && allowedCallbackOrigins.length === 0) {
    throw new Error("ALLOWED_CALLBACK_ORIGINS is required in production (comma-separated https origins)");
  }
  const webOrigin = env.WEB_ORIGIN?.trim() || undefined;
  if (isProduction && webOrigin && !allowedCallbackOrigins.includes(webOrigin)) {
    throw new Error("WEB_ORIGIN must be listed in ALLOWED_CALLBACK_ORIGINS");
  }
  const defaultCallbackOrigin = webOrigin ?? allowedCallbackOrigins[0];

  // ── اعداد ──
  const reconcileAfterMin = int(env.PAYMENT_RECONCILE_AFTER_MIN, 15, "PAYMENT_RECONCILE_AFTER_MIN", 5, 120);
  const reconcileEverySec = int(env.PAYMENT_RECONCILE_EVERY_SEC, 300, "PAYMENT_RECONCILE_EVERY_SEC", 30, 3600);
  const paymentHoldMin = int(env.PAYMENT_HOLD_MIN, 30, "PAYMENT_HOLD_MIN", 10, 180);
  if (paymentHoldMin * 60 < reconcileAfterMin * 60 + 2 * reconcileEverySec) {
    throw new Error("PAYMENT_HOLD_MIN must outlast PAYMENT_RECONCILE_AFTER_MIN + 2×PAYMENT_RECONCILE_EVERY_SEC, otherwise the slot can expire before the reconcile job sees a late payment");
  }

  return {
    isProduction,
    primary,
    fallbacks,
    zarinpal, zibal, idpay,
    sandboxMode,
    allowedCallbackOrigins,
    defaultCallbackOrigin,
    httpTimeoutMs: int(env.PAYMENT_HTTP_TIMEOUT_MS, 10_000, "PAYMENT_HTTP_TIMEOUT_MS", 1000, 30_000),
    reconcileAfterMin,
    reconcileEverySec,
    attemptGiveUpHours: int(env.PAYMENT_ATTEMPT_GIVEUP_HOURS, 24, "PAYMENT_ATTEMPT_GIVEUP_HOURS", 1, 168),
    paymentHoldMin,
    breakerFailures: int(env.PAYMENT_BREAKER_FAILURES, 3, "PAYMENT_BREAKER_FAILURES", 1, 20),
    breakerCooldownSec: int(env.PAYMENT_BREAKER_COOLDOWN_SEC, 60, "PAYMENT_BREAKER_COOLDOWN_SEC", 5, 3600),
    ratePerUserPerMin: int(env.PAYMENT_RATE_PER_USER_PER_MIN, 10, "PAYMENT_RATE_PER_USER_PER_MIN", 1, 100),
    refundDualApproval: parseBoolDefault(env.REFUND_DUAL_APPROVAL, true, "REFUND_DUAL_APPROVAL"),
    refundDualApprovalMinRial: parseNonNegativeBigint(env.REFUND_DUAL_APPROVAL_MIN_RIAL, "REFUND_DUAL_APPROVAL_MIN_RIAL"),
  };
}

/** خلاصه‌ی بی‌خطر برای لاگ بوت (بدون هیچ راز). */
export function describePaymentConfig(c: PaymentConfig): string {
  const sbx = [c.zarinpal?.sandbox && "zarinpal", c.zibal?.sandbox && "zibal", c.idpay?.sandbox && "idpay"].filter(Boolean);
  return `payments: primary=${c.primary} fallbacks=[${c.fallbacks.join(",")}] sandboxFlags=[${sbx.join(",")}] env=${c.isProduction ? "production" : "non-production"} refundDualApproval=${c.refundDualApproval ? `on(min=${c.refundDualApprovalMinRial})` : "OFF"}`;
}
