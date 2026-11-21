/**
 * قرارداد درگاه پرداخت (الگوی Strategy).
 *
 * اصل‌های ثابت:
 *  - «تنها» پاسخ سرور درگاه معتبر است؛ هیچ پارامتری از callback مرورگر (Status، success، …) تصمیم نمی‌گیرد.
 *  - مبلغ همیشه «ریال» و عدد صحیح (bigint) است؛ همان مبلغِ ثبت‌شده در DB به درگاه می‌رود و در verify مطابقت داده می‌شود.
 *  - فقط «شناسه‌ی مبهم» (orderId) و مبلغ به درگاه می‌رود؛ هرگز نام/تخصص/دلیل مراجعه یا هر داده‌ی سلامت/شخصی
 *    (docs/data-classification.md).
 */

export const GATEWAY_NAMES = ["zarinpal", "zibal", "idpay"] as const;
export type RealGatewayName = (typeof GATEWAY_NAMES)[number];
/** «sandbox» درگاه جعلی توسعه/تست است و در production هرگز ساخته نمی‌شود. */
export type GatewayName = RealGatewayName | "sandbox";

export interface RequestInput {
  /** شناسه‌ی داخلی تلاش پرداخت (UUID) — همان orderId نزد درگاه. */
  orderId: string;
  amountRial: bigint;
  /** آدرس بازگشت «کانونیِ» ساخته‌شده در سرور (نه مقدار خام کلاینت). */
  callbackUrl: string;
  /** توضیح عمومی بدون داده‌ی شخصی. */
  description: string;
}

export interface RequestResult {
  /** توکن سمت درگاه: authority (زرین‌پال)، trackId (Zibal)، id (IDPay). */
  authority: string;
  /** آدرسی که مرورگر کاربر به آن هدایت می‌شود. */
  payUrl: string;
}

export interface VerifyInput {
  authority: string;
  orderId: string;
  amountRial: bigint;
}

export type VerifyOutcome =
  | {
      kind: "PAID";
      /** شماره‌ی پیگیری/مرجع بانکی. */
      refId: string;
      /** مبلغ تأییدشده از سمت درگاه (اگر درگاه برگرداند). */
      amountRial?: bigint;
      /** فقط ۴ رقم آخر کارت (ماسک‌شده). */
      cardPanMasked?: string;
      feeRial?: bigint;
      /** درگاه می‌گوید قبلاً verify شده (فراخوانی تکراری/بازیابی بعد از crash). */
      alreadyVerified: boolean;
    }
  | { kind: "NOT_PAID"; code: string }
  /**
   * ناهمخوانی مبلغ/سفارش بین DB و درگاه (یا نبودن مبلغ در پاسخ درگاهی که باید بدهد).
   * پول ممکن است جابه‌جا شده باشد ⇒ «هرگز» نوبت را تأیید نکن؛ برای بررسی دستی علامت بزن و هشدار بده.
   */
  | { kind: "MISMATCH"; code: string; gatewayAmountRial?: bigint };

export type InquiryOutcome =
  | { kind: "PAID_UNVERIFIED" }
  | { kind: "VERIFIED" }
  | { kind: "PENDING" }
  | { kind: "FAILED"; code: string }
  | { kind: "UNKNOWN"; code: string };

export type GatewayErrorKind =
  /** قطعی/timeout/۵xx/پاسخ غیرقابل‌فهم: درگاه «در دسترس نیست» ⇒ failover (فقط برای request) و تلاش مجدد. */
  | "unavailable"
  /** درگاه درخواست را صریحاً رد کرد (merchant نامعتبر، مبلغ خارج از بازه، …). */
  | "rejected";

export class GatewayError extends Error {
  constructor(
    readonly gateway: GatewayName,
    readonly kind: GatewayErrorKind,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

/** استرداد وجه (قابلیت اختیاری هر درگاه). */
export interface RefundInput {
  /** authority ی همان تلاشِ تأییدشده‌ای که پول را گرفته است. */
  authority: string;
  orderId: string;
  amountRial: bigint;
  /** توضیح عمومی بدون داده‌ی شخصی/سلامت. */
  description: string;
}

/**
 * نتیجه‌ی «قطعی» استرداد. حالت مبهم (timeout/۵xx/پاسخ نامفهوم) «هرگز» نتیجه نیست: GatewayError("unavailable") پرتاب می‌شود
 * و سرویس آن را REVIEW می‌کند (درگاه ممکن است استرداد را ثبت کرده باشد؛ تلاش مجدد خودکار = خطر استرداد دوباره).
 */
export type RefundOutcome =
  | { kind: "ACCEPTED"; externalRef: string; gatewayStatus: string }
  | { kind: "REJECTED"; code: string }
  | { kind: "UNSUPPORTED"; reason: "not_configured" | "below_minimum" | "unknown_session" | "no_api" };

export interface PaymentGateway {
  readonly name: GatewayName;
  request(input: RequestInput): Promise<RequestResult>;
  /** تأیید نهایی سمت سرور. ایدمپوتنت: فراخوانی دوباره باید `alreadyVerified: true` بدهد. */
  verify(input: VerifyInput): Promise<VerifyOutcome>;
  /** استعلام وضعیت (فقط‌خواندنی؛ هیچ تغییری در درگاه نمی‌دهد). */
  inquire(input: { authority: string; orderId: string }): Promise<InquiryOutcome>;
  /** استرداد وجه؛ درگاه‌هایی که API ندارند آن را پیاده نمی‌کنند ⇒ استرداد «دستی» (ادمین از پنل درگاه). */
  refund?(input: RefundInput): Promise<RefundOutcome>;
}

export const PAYMENT_GATEWAYS = Symbol("PAYMENT_GATEWAYS");

/** فقط ۴ رقم آخر کارت را نگه دار (PAN کامل هرگز ذخیره نمی‌شود). */
export function maskCard(pan: unknown): string | undefined {
  if (typeof pan !== "string") return undefined;
  const digits = pan.replace(/\D/g, "");
  return digits.length >= 4 ? `****${digits.slice(-4)}` : undefined;
}

/** تبدیل امن عدد/رشته‌ی عددی به bigint؛ مقدار نامعتبر ⇒ undefined (هرگز NaN وارد مقایسه‌ی مبلغ نمی‌شود). */
export function toBigInt(v: unknown): bigint | undefined {
  if (typeof v === "bigint") return v;
  if (typeof v === "number" && Number.isSafeInteger(v)) return BigInt(v);
  if (typeof v === "string" && /^\d{1,18}$/.test(v)) return BigInt(v);
  return undefined;
}
