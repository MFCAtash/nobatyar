import type { GatewayName, InquiryOutcome, VerifyOutcome } from "./gateway/gateway";

/**
 * منطق «خالص» تصمیم‌گیری پرداخت — بدون I/O (مثل scheduling/actions.ts).
 * سرویس‌ها فقط حقایق را از DB/درگاه جمع می‌کنند و تصمیم را به این توابع می‌سپارند.
 */

export type AttemptStatus = "INITIATED" | "VERIFIED" | "FAILED" | "EXPIRED" | "MISMATCH";

export const MAX_ATTEMPTS_PER_PAYMENT = 5;
/** تلاشی که کمتر از این (دقیقه) از ساختش گذشته با دوباره‌زدن «پرداخت» همان لینک را می‌گیرد. */
export const ATTEMPT_REUSE_MIN = 10;

/** نام درگاه در DB (enum بزرگ) ⇄ نام درگاه در کد (حروف کوچک). */
export const toDbGateway = (g: GatewayName) => g.toUpperCase() as "ZARINPAL" | "ZIBAL" | "IDPAY" | "SANDBOX";
export const fromDbGateway = (g: string): GatewayName => g.toLowerCase() as GatewayName;

// ───────────── تأیید ─────────────

export type PaidDecision =
  | { ok: true }
  | { ok: false; code: "attempt_amount_differs_from_payment" | "gateway_amount_mismatch" };

/**
 * آیا نتیجه‌ی «PAID» درگاه واقعاً با DB می‌خواند؟
 *  - مبلغ تلاش باید برابر مبلغ Payment باشد (نباید در فاصله‌ی شروع و تأیید تغییر کرده باشد).
 *  - اگر درگاه مبلغ برگرداند باید «دقیقاً» برابر باشد.
 */
export function checkPaid(outcome: Extract<VerifyOutcome, { kind: "PAID" }>, attemptAmount: bigint, paymentAmount: bigint): PaidDecision {
  if (attemptAmount !== paymentAmount) return { ok: false, code: "attempt_amount_differs_from_payment" };
  if (outcome.amountRial !== undefined && outcome.amountRial !== attemptAmount) return { ok: false, code: "gateway_amount_mismatch" };
  return { ok: true };
}

export type NotPaidAction =
  /** درگاه می‌گوید پرداخت شده (verify هنوز نشده یا همزمان انجام شد) ⇒ یک‌بار دیگر verify. */
  | "RETRY_VERIFY"
  /** صبر؛ کاربر هنوز در صفحه‌ی بانک است یا وضعیت نامعلوم است. job دوباره می‌پرسد. */
  | "WAIT"
  /** درگاه صریحاً ناموفق اعلام کرد ⇒ تلاش FAILED. */
  | "FAIL"
  /** مدت زیادی گذشته و هنوز پرداخت نشده ⇒ EXPIRED. */
  | "EXPIRE"
  /** وضعیت ناشناخته پس از مهلت ⇒ بررسی انسانی. */
  | "REVIEW";

/**
 * وقتی verify می‌گوید «پرداخت نشده»، فقط «استعلام درگاه» تعیین می‌کند چه بشود — هرگز پارامتر Status مرورگر.
 * چرا فوراً FAILED نکنیم؟ کاربر ممکن است هنوز در صفحه‌ی بانک باشد؛ verify ی زودهنگام (یا مهاجم) نباید
 * تلاشی را که بعداً پرداخت می‌شود «بسوزاند».
 */
export function afterNotPaid(inq: InquiryOutcome | null, ageMs: number, giveUpMs: number): NotPaidAction {
  if (inq === null) return ageMs > giveUpMs ? "REVIEW" : "WAIT"; // استعلام هم خطا داد
  switch (inq.kind) {
    case "PAID_UNVERIFIED":
    case "VERIFIED":
      return "RETRY_VERIFY";
    case "FAILED":
      return "FAIL";
    case "PENDING":
      return ageMs > giveUpMs ? "EXPIRE" : "WAIT";
    case "UNKNOWN":
      return ageMs > giveUpMs ? "REVIEW" : "WAIT";
  }
}

/** وضعیت تجمیعیِ Payment از روی وضعیت تلاش‌ها (فقط برای حالت «پرداخت‌نشده»). */
export function aggregateUnpaidStatus(attempts: { status: AttemptStatus }[]): "INITIATED" | "FAILED" {
  return attempts.some((a) => a.status === "INITIATED" || a.status === "MISMATCH") ? "INITIATED" : "FAILED";
}

// ───────────── شروع دوباره (جلوگیری از پرداخت دوباره) ─────────────

export interface AttemptFacts {
  id: string;
  status: AttemptStatus;
  createdAt: Date;
  payUrl: string | null;
}

/** تلاش‌های INITIATED که پیش از ساخت لینک جدید باید از درگاه استعلام شوند (تازه‌ترین اول، حداکثر ۳). */
export function attemptsToInquire(attempts: AttemptFacts[]): AttemptFacts[] {
  return attempts
    .filter((a) => a.status === "INITIATED")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 3);
}

/** آیا این تلاشِ در انتظار هنوز قابل‌استفاده‌ی مجدد است (همان لینک درگاه)؟ */
export function isReusable(a: AttemptFacts, now: Date): boolean {
  return a.status === "INITIATED" && !!a.payUrl && now.getTime() - a.createdAt.getTime() < ATTEMPT_REUSE_MIN * 60_000;
}

// ───────────── نوبت ⇄ پرداخت ─────────────

export type SyncPlan =
  | { action: "CONFIRM" } // نوبت PENDING_PAYMENT است ⇒ PAYMENT_SUCCEEDED
  | { action: "MARK_SYNCED" } // نوبت قبلاً جلو رفته
  | { action: "REFUND" }; // نوبت دیگر قابل‌تأیید نیست (منقضی/لغو) ⇒ بازپرداخت کامل

/** پس از PAID شدن Payment، با نوبت چه کنیم؟ */
export function planAppointmentSync(apptStatus: string): SyncPlan {
  switch (apptStatus) {
    case "PENDING_PAYMENT":
      return { action: "CONFIRM" };
    case "PENDING_CONFIRMATION":
    case "CONFIRMED":
    case "IN_PROGRESS":
    case "COMPLETED":
      return { action: "MARK_SYNCED" };
    default:
      return { action: "REFUND" }; // EXPIRED، CANCELLED_*، NO_SHOW_*
  }
}

/** تمدید نگه‌داشتن اسلات هنگام شروع پرداخت: هرگز کوتاه نمی‌کند. */
export function extendedHold(current: Date | null, now: Date, holdMin: number): Date {
  const target = new Date(now.getTime() + holdMin * 60_000);
  return current && current.getTime() > target.getTime() ? current : target;
}

/** سقف سنی که job تلاش را بررسی می‌کند (برای claim). */
export function reconcileCutoffs(now: Date, afterMin: number, recheckMin = 4) {
  return {
    createdBefore: new Date(now.getTime() - afterMin * 60_000),
    checkedBefore: new Date(now.getTime() - recheckMin * 60_000),
  };
}
