import { GatewayError, maskCard, toBigInt } from "./gateway";
import type { InquiryOutcome, PaymentGateway, RefundInput, RefundOutcome, RequestInput, RequestResult, VerifyInput, VerifyOutcome } from "./gateway";
import { postJson } from "./http";
import type { HttpOptions } from "./http";

export interface ZarinpalConfig {
  merchantId: string;
  sandbox: boolean;
  /** توکن دسترسی (غیر از merchant id) برای API ی GraphQL استرداد؛ نبودنش ⇒ استرداد «دستی». */
  accessToken?: string;
  /** PAYA = استرداد عادی (سیکل پایا)، CARD = آنی. پیش‌فرض PAYA. */
  refundMethod?: "PAYA" | "CARD";
  graphqlUrl?: string;
}

export const ZARINPAL_GRAPHQL_URL = "https://next.zarinpal.com/api/v4/graphql/";
/** حداقل مبلغ قابل استرداد (ریال) طبق مستندات زرین‌پال. */
export const ZARINPAL_MIN_REFUND_RIAL = 20_000n;

const ADD_REFUND = `mutation AddRefund($session_id: ID!, $amount: BigInteger!, $description: String, $method: InstantPayoutActionTypeEnum, $reason: RefundReasonEnum) {
  resource: AddRefund(session_id: $session_id, amount: $amount, description: $description, method: $method, reason: $reason) {
    terminal_id id amount timeline { refund_amount refund_time refund_status }
  }
}`;

/**
 * شماره‌ی تراکنش (session_id) از authority: بخش عددیِ authority («A000…123456» ⇒ «123456»).
 * ⚠️ فرض مستند نشده در مستندات رسمی؛ اگر درست نبود، زرین‌پال استرداد را رد می‌کند (REJECTED) و ادمین دستی انجام می‌دهد.
 */
export function sessionIdFromAuthority(authority: string): string | undefined {
  const m = /^A0*([1-9]\d{0,17})$/.exec(authority);
  return m?.[1];
}

const HOSTS = {
  live: "https://payment.zarinpal.com",
  sandbox: "https://sandbox.zarinpal.com",
} as const;

/** کدهای خطای verify که یعنی «پرداخت انجام نشده/ناموفق» (قطعی، نه خطای تنظیمات). */
const VERIFY_NOT_PAID = new Set(["-51", "-54"]);

/**
 * زرین‌پال — API نسخه‌ی ۴ (JSON).
 *   request  : POST /pg/v4/payment/request.json   ⇒ data.authority
 *   verify   : POST /pg/v4/payment/verify.json    ⇒ data.code 100 (تأیید) / 101 (قبلاً تأیید شده)
 *   inquiry  : POST /pg/v4/payment/inquiry.json   ⇒ data.status
 * مبلغ در verify «از DB» فرستاده می‌شود و خودِ زرین‌پال آن را با مبلغ ثبت‌شده در request مطابقت می‌دهد (-50 در ناهمخوانی).
 */
export class ZarinpalGateway implements PaymentGateway {
  readonly name = "zarinpal" as const;
  private readonly host: string;

  constructor(private readonly cfg: ZarinpalConfig, private readonly http: HttpOptions) {
    this.host = cfg.sandbox ? HOSTS.sandbox : HOSTS.live;
  }

  private post(path: string, body: Record<string, unknown>) {
    return postJson(this.name, `${this.host}/pg/v4/payment/${path}.json`, { merchant_id: this.cfg.merchantId, ...body }, this.http);
  }

  /** پاسخ زرین‌پال: موفقیت ⇒ {data:{code,...}, errors:[]}؛ خطا ⇒ {data:[], errors:{code,message}} */
  private static parse(json: Record<string, unknown>): { code: string; data: Record<string, unknown> } {
    const errors = json.errors as { code?: unknown } | unknown[] | undefined;
    if (errors && !Array.isArray(errors) && typeof errors === "object" && errors.code !== undefined) {
      return { code: String(errors.code), data: {} };
    }
    const data = json.data;
    if (data && !Array.isArray(data) && typeof data === "object") {
      const d = data as Record<string, unknown>;
      return { code: String(d.code ?? ""), data: d };
    }
    return { code: "", data: {} };
  }

  async request(input: RequestInput): Promise<RequestResult> {
    const { json } = await this.post("request", {
      amount: Number(input.amountRial), // ریال؛ مبلغ‌ها زیر 2^53 هستند (CHECK در DB + سقف سیاستی)
      currency: "IRR",
      description: input.description,
      callback_url: input.callbackUrl,
      metadata: { order_id: input.orderId },
    });
    const { code, data } = ZarinpalGateway.parse(json);
    const authority = data.authority;
    if (code !== "100" || typeof authority !== "string" || !/^[A-Za-z0-9]{10,64}$/.test(authority)) {
      throw new GatewayError(this.name, "rejected", `zarinpal: request rejected (code ${code || "?"})`, code || undefined);
    }
    return { authority, payUrl: `${this.host}/pg/StartPay/${authority}` };
  }

  async verify(input: VerifyInput): Promise<VerifyOutcome> {
    const { json } = await this.post("verify", { amount: Number(input.amountRial), authority: input.authority });
    const { code, data } = ZarinpalGateway.parse(json);
    if (code === "100" || code === "101") {
      const refId = data.ref_id;
      if (refId === undefined || refId === null || String(refId) === "") {
        // «موفق» بدون ref_id = پاسخ ناقص؛ تأیید نکن، بعداً دوباره تلاش می‌شود
        throw new GatewayError(this.name, "unavailable", "zarinpal: verify ok but ref_id missing");
      }
      return {
        kind: "PAID",
        refId: String(refId),
        cardPanMasked: maskCard(data.card_pan),
        feeRial: toBigInt(data.fee),
        alreadyVerified: code === "101",
      };
    }
    if (code === "-50") return { kind: "MISMATCH", code };
    if (VERIFY_NOT_PAID.has(code)) return { kind: "NOT_PAID", code };
    // سایر کدها (merchant نامعتبر، IP مجاز نیست، …) = مشکل تنظیمات/سرویس، نه «پرداخت نشده»
    throw new GatewayError(this.name, "rejected", `zarinpal: verify error (code ${code || "?"})`, code || undefined);
  }

  async inquire(input: { authority: string }): Promise<InquiryOutcome> {
    const { json } = await this.post("inquiry", { authority: input.authority });
    const { code, data } = ZarinpalGateway.parse(json);
    if (code === "-54") return { kind: "FAILED", code }; // authority نامعتبر/منقضی ⇒ هرگز پرداخت نمی‌شود
    if (code !== "100") return { kind: "UNKNOWN", code: code || "?" };
    switch (String(data.status ?? "").toUpperCase()) {
      case "PAID": return { kind: "PAID_UNVERIFIED" };
      case "VERIFIED": return { kind: "VERIFIED" };
      case "IN_BANK": return { kind: "PENDING" };
      case "FAILED": return { kind: "FAILED", code: "FAILED" };
      default: return { kind: "UNKNOWN", code: `status:${String(data.status ?? "?")}` };
    }
  }

  /**
   * AddRefund (GraphQL، مستندات رسمی). بدون idempotency key: پاسخ مبهم ⇒ GatewayError("unavailable") ⇒ سرویس REVIEW می‌کند.
   * خطای GraphQL با HTTP 200 برمی‌گردد؛ خطای سرور داخلی «مبهم» است نه رد قطعی.
   */
  async refund(input: RefundInput): Promise<RefundOutcome> {
    if (!this.cfg.accessToken) return { kind: "UNSUPPORTED", reason: "not_configured" };
    if (input.amountRial < ZARINPAL_MIN_REFUND_RIAL) return { kind: "UNSUPPORTED", reason: "below_minimum" };
    const sessionId = sessionIdFromAuthority(input.authority);
    if (!sessionId) return { kind: "UNSUPPORTED", reason: "unknown_session" };

    const { json } = await postJson(
      this.name,
      this.cfg.graphqlUrl ?? ZARINPAL_GRAPHQL_URL,
      { query: ADD_REFUND, variables: { session_id: sessionId, amount: input.amountRial.toString(), description: input.description, method: this.cfg.refundMethod ?? "PAYA", reason: "CUSTOMER_REQUEST" } },
      this.http,
      { Authorization: `Bearer ${this.cfg.accessToken}` },
    );

    const errors = json.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      const ext = (errors[0] as { extensions?: { code?: unknown } })?.extensions;
      const code = typeof ext?.code === "string" ? ext.code : "graphql_error";
      if (code === "INTERNAL_SERVER_ERROR") throw new GatewayError(this.name, "unavailable", "zarinpal: refund internal error");
      return { kind: "REJECTED", code };
    }
    const data = json.data as { resource?: { id?: unknown; timeline?: { refund_status?: unknown } } | null } | undefined;
    const res = data?.resource;
    if (!res || res.id === undefined || res.id === null) throw new GatewayError(this.name, "unavailable", "zarinpal: refund response not understood");
    const status = String(res.timeline?.refund_status ?? "").toUpperCase();
    if (status === "FAILED") return { kind: "REJECTED", code: "refund_status_failed" };
    return { kind: "ACCEPTED", externalRef: String(res.id), gatewayStatus: status || "UNKNOWN" }; // PENDING = ثبت شد؛ پول در سیکل بانکی برمی‌گردد
  }
}
