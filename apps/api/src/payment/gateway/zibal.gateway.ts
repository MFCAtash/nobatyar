import { GatewayError, maskCard, toBigInt } from "./gateway";
import type { InquiryOutcome, PaymentGateway, RequestInput, RequestResult, VerifyInput, VerifyOutcome } from "./gateway";
import { postJson } from "./http";
import type { HttpOptions } from "./http";

export interface ZibalConfig {
  merchant: string;
  sandbox: boolean;
}

const HOST = "https://gateway.zibal.ir";
/** merchant ی آزمایشی زیبال؛ در production ممنوع (payment.config). */
export const ZIBAL_TEST_MERCHANT = "zibal";

/** وضعیت‌های «ناموفق» در inquiry (کاربر لغو کرد، کارت نامعتبر، رمز غلط، موجودی ناکافی، …) */
const FAILED_STATUSES = new Set([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

/**
 * Zibal:
 *   request : POST /v1/request  ⇒ trackId، result=100
 *   verify  : POST /v1/verify   ⇒ result 100 (تأیید) / 201 (قبلاً تأیید شده) / 202 (پرداخت نشده)؛ status=1 یعنی پرداخت‌شده
 *   inquiry : POST /v1/inquiry  ⇒ status
 * مبلغ و orderId در پاسخ verify با مقدار DB مطابقت داده می‌شوند (نبودن مبلغ ⇒ MISMATCH، fail-closed).
 */
export class ZibalGateway implements PaymentGateway {
  readonly name = "zibal" as const;

  constructor(private readonly cfg: ZibalConfig, private readonly http: HttpOptions) {}

  private post(path: string, body: Record<string, unknown>) {
    return postJson(this.name, `${HOST}/v1/${path}`, { merchant: this.cfg.merchant, ...body }, this.http);
  }

  async request(input: RequestInput): Promise<RequestResult> {
    const { json } = await this.post("request", {
      amount: Number(input.amountRial),
      callbackUrl: input.callbackUrl,
      description: input.description,
      orderId: input.orderId,
    });
    const trackId = json.trackId;
    if (Number(json.result) !== 100 || !(typeof trackId === "number" || typeof trackId === "string") || !/^\d{1,18}$/.test(String(trackId))) {
      throw new GatewayError(this.name, "rejected", `zibal: request rejected (result ${String(json.result ?? "?")})`, String(json.result ?? ""));
    }
    return { authority: String(trackId), payUrl: `${HOST}/start/${trackId}` };
  }

  async verify(input: VerifyInput): Promise<VerifyOutcome> {
    const { json } = await this.post("verify", { trackId: Number(input.authority) });
    const result = Number(json.result);
    if (result === 202) return { kind: "NOT_PAID", code: "202" };
    if (result === 203) return { kind: "NOT_PAID", code: "203" }; // trackId نامعتبر
    if (result !== 100 && result !== 201) {
      throw new GatewayError(this.name, "rejected", `zibal: verify error (result ${String(json.result ?? "?")})`, String(json.result ?? ""));
    }
    // result 100/201 ولی status=1 نیست ⇒ پرداخت تأییدشده‌ای وجود ندارد
    if (Number(json.status) !== 1) return { kind: "NOT_PAID", code: `status:${String(json.status ?? "?")}` };

    const amount = toBigInt(json.amount);
    if (amount === undefined) return { kind: "MISMATCH", code: "amount_missing" };
    if (amount !== input.amountRial) return { kind: "MISMATCH", code: "amount_mismatch", gatewayAmountRial: amount };
    if (json.orderId !== undefined && json.orderId !== null && String(json.orderId) !== input.orderId) {
      return { kind: "MISMATCH", code: "order_mismatch", gatewayAmountRial: amount };
    }
    const refNumber = json.refNumber;
    if (refNumber === undefined || refNumber === null || String(refNumber) === "") {
      throw new GatewayError(this.name, "unavailable", "zibal: verify ok but refNumber missing");
    }
    return { kind: "PAID", refId: String(refNumber), amountRial: amount, cardPanMasked: maskCard(json.cardNumber), alreadyVerified: result === 201 };
  }

  async inquire(input: { authority: string }): Promise<InquiryOutcome> {
    const { json } = await this.post("inquiry", { trackId: Number(input.authority) });
    const result = Number(json.result);
    if (result === 203) return { kind: "FAILED", code: "203" };
    if (result !== 100) return { kind: "UNKNOWN", code: String(json.result ?? "?") };
    const status = Number(json.status);
    if (status === 1) return { kind: "VERIFIED" };
    if (status === 2) return { kind: "PAID_UNVERIFIED" };
    if (status === -1) return { kind: "PENDING" };
    if (FAILED_STATUSES.has(status)) return { kind: "FAILED", code: `status:${status}` };
    return { kind: "UNKNOWN", code: `status:${String(json.status ?? "?")}` }; // 15/16/18 (برگشت‌خورده) و ناشناخته ⇒ بررسی انسانی
  }
}
