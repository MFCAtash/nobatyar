import { GatewayError, maskCard, toBigInt } from "./gateway";
import type { InquiryOutcome, PaymentGateway, RequestInput, RequestResult, VerifyInput, VerifyOutcome } from "./gateway";
import { postJson } from "./http";
import type { HttpOptions } from "./http";

export interface IdpayConfig {
  apiKey: string;
  sandbox: boolean;
}

const HOST = "https://api.idpay.ir/v1.1/payment";
const FAILED_STATUSES = new Set([2, 3, 4, 5, 6, 7]);

/**
 * IDPay:
 *   request : POST /v1.1/payment          ⇒ {id, link}
 *   verify  : POST /v1.1/payment/verify   ⇒ status 100 (تأیید) / 101 (قبلاً تأیید شده)
 *   inquiry : POST /v1.1/payment/inquiry  ⇒ status
 * احراز با هدر X-API-KEY؛ حالت آزمایشی با هدر X-SANDBOX: 1.
 * شناسه‌ی «id» همان authority ی ما و order_id همان orderId است (هر دو در verify لازم‌اند).
 */
export class IdpayGateway implements PaymentGateway {
  readonly name = "idpay" as const;

  constructor(private readonly cfg: IdpayConfig, private readonly http: HttpOptions) {}

  private post(path: string, body: Record<string, unknown>) {
    return postJson(this.name, `${HOST}${path}`, body, this.http, {
      "X-API-KEY": this.cfg.apiKey,
      "X-SANDBOX": this.cfg.sandbox ? "1" : "0",
    });
  }

  async request(input: RequestInput): Promise<RequestResult> {
    const { json } = await this.post("", {
      order_id: input.orderId,
      amount: Number(input.amountRial),
      callback: input.callbackUrl,
      desc: input.description,
    });
    const id = json.id;
    const link = json.link;
    if (typeof id !== "string" || !/^[A-Za-z0-9]{8,64}$/.test(id) || typeof link !== "string" || !/^https:\/\//.test(link)) {
      const code = String(json.error_code ?? "?");
      throw new GatewayError(this.name, "rejected", `idpay: request rejected (error_code ${code})`, code);
    }
    return { authority: id, payUrl: link };
  }

  async verify(input: VerifyInput): Promise<VerifyOutcome> {
    const { json } = await this.post("/verify", { id: input.authority, order_id: input.orderId });
    if (json.error_code !== undefined) {
      const code = String(json.error_code);
      // 52: نتیجه‌ای برای استعلام نیست، 53: تأیید ممکن نیست (پرداخت نشده/برگشت خورده)
      if (code === "52" || code === "53") return { kind: "NOT_PAID", code };
      // 54: مهلت تأیید گذشته (IDPay خودش مبلغ را برمی‌گرداند)، سایر: تنظیمات/سرویس
      throw new GatewayError(this.name, "rejected", `idpay: verify error (error_code ${code})`, code);
    }
    const status = Number(json.status);
    if (status !== 100 && status !== 101) return { kind: "NOT_PAID", code: `status:${String(json.status ?? "?")}` };

    const payment = (json.payment ?? {}) as Record<string, unknown>;
    const amount = toBigInt(json.amount) ?? toBigInt(payment.amount);
    if (amount === undefined) return { kind: "MISMATCH", code: "amount_missing" };
    if (amount !== input.amountRial) return { kind: "MISMATCH", code: "amount_mismatch", gatewayAmountRial: amount };
    if (json.order_id !== undefined && json.order_id !== null && String(json.order_id) !== input.orderId) {
      return { kind: "MISMATCH", code: "order_mismatch", gatewayAmountRial: amount };
    }
    const track = json.track_id ?? payment.track_id;
    if (track === undefined || track === null || String(track) === "") {
      throw new GatewayError(this.name, "unavailable", "idpay: verify ok but track_id missing");
    }
    return {
      kind: "PAID",
      refId: String(track),
      amountRial: amount,
      cardPanMasked: maskCard(payment.card_no),
      alreadyVerified: status === 101,
    };
  }

  async inquire(input: { authority: string; orderId: string }): Promise<InquiryOutcome> {
    const { json } = await this.post("/inquiry", { id: input.authority, order_id: input.orderId });
    if (json.error_code !== undefined) {
      const code = String(json.error_code);
      return code === "52" ? { kind: "FAILED", code } : { kind: "UNKNOWN", code };
    }
    const status = Number(json.status);
    if (status === 1) return { kind: "PENDING" };
    if (status === 10) return { kind: "PAID_UNVERIFIED" };
    if (status === 100 || status === 101 || status === 200) return { kind: "VERIFIED" };
    if (FAILED_STATUSES.has(status)) return { kind: "FAILED", code: `status:${status}` };
    return { kind: "UNKNOWN", code: `status:${String(json.status ?? "?")}` };
  }
}
