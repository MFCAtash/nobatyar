import { randomUUID } from "node:crypto";
import type { InquiryOutcome, PaymentGateway, RequestInput, RequestResult, VerifyInput, VerifyOutcome } from "./gateway";

export type SandboxMode = "success" | "fail" | "pending";

/**
 * درگاه جعلیِ «فقط توسعه/تست». هیچ پولی و هیچ شبکه‌ای ندارد.
 * - در NODE_ENV=production «هرگز» ساخته نمی‌شود (loadPaymentConfig fail-closed + registry دوباره بررسی می‌کند).
 * - authority با پیشوند SANDBOX- ساخته می‌شود؛ service در production چنین attempt ی را اصلاً verify نمی‌کند.
 * - بر خلاف stub قدیمی (verified = true)، رفتار با PAYMENT_SANDBOX_MODE قابل‌تنظیم است تا مسیرهای شکست هم تست شوند.
 */
export class SandboxGateway implements PaymentGateway {
  readonly name = "sandbox" as const;

  constructor(private readonly mode: SandboxMode = "success", private readonly isProduction = process.env.NODE_ENV === "production") {
    if (isProduction) throw new Error("SandboxGateway cannot be constructed in production");
  }

  async request(input: RequestInput): Promise<RequestResult> {
    const authority = `SANDBOX-${randomUUID()}`;
    const sep = input.callbackUrl.includes("?") ? "&" : "?";
    return { authority, payUrl: `${input.callbackUrl}${sep}Authority=${authority}&Status=${this.mode === "fail" ? "NOK" : "OK"}` };
  }

  async verify(input: VerifyInput): Promise<VerifyOutcome> {
    if (!input.authority.startsWith("SANDBOX-")) return { kind: "NOT_PAID", code: "not_sandbox" };
    if (this.mode === "fail") return { kind: "NOT_PAID", code: "sandbox_fail" };
    if (this.mode === "pending") return { kind: "NOT_PAID", code: "sandbox_pending" };
    return { kind: "PAID", refId: `SBX-${input.authority.slice(8, 16)}`, amountRial: input.amountRial, alreadyVerified: false };
  }

  async inquire(input: { authority: string }): Promise<InquiryOutcome> {
    if (!input.authority.startsWith("SANDBOX-")) return { kind: "FAILED", code: "not_sandbox" };
    if (this.mode === "fail") return { kind: "FAILED", code: "sandbox_fail" };
    if (this.mode === "pending") return { kind: "PENDING" };
    return { kind: "PAID_UNVERIFIED" };
  }

  /** استرداد جعلی (فقط dev/test): پذیرش مگر authority غیر sandbox. */
  async refund(input: { authority: string }): Promise<import("./gateway").RefundOutcome> {
    if (!input.authority.startsWith("SANDBOX-")) return { kind: "REJECTED", code: "not_sandbox" };
    return { kind: "ACCEPTED", externalRef: `SBX-REFUND-${input.authority.slice(8, 16)}`, gatewayStatus: "PENDING" };
  }
}
