import { describe, expect, it } from "vitest";
import { GatewayError, maskCard, toBigInt } from "./gateway";
import { postJson } from "./http";
import type { FetchLike } from "./http";
import { IdpayGateway } from "./idpay.gateway";
import { SandboxGateway } from "./sandbox.gateway";
import { ZarinpalGateway } from "./zarinpal.gateway";
import { ZibalGateway } from "./zibal.gateway";

const MID = "11111111-2222-3333-4444-555555555555";
const ORDER = "99999999-8888-7777-6666-555555555555";

type Call = { url: string; body: Record<string, unknown>; headers: Record<string, string> };
function fakeFetch(respond: (call: Call) => { status?: number; body: unknown } | Error) {
  const calls: Call[] = [];
  const fn: FetchLike = async (url, init) => {
    const call = { url, body: JSON.parse(init.body), headers: init.headers };
    calls.push(call);
    const r = respond(call);
    if (r instanceof Error) throw r;
    return { status: r.status ?? 200, text: async () => (typeof r.body === "string" ? r.body : JSON.stringify(r.body)) };
  };
  return { fn, calls };
}
const http = (f: FetchLike) => ({ timeoutMs: 1000, fetchFn: f });

describe("helpers", () => {
  it("maskCard فقط ۴ رقم آخر", () => {
    expect(maskCard("502229******5995")).toBe("****5995");
    expect(maskCard("6274121234561234")).toBe("****1234");
    expect(maskCard("12")).toBeUndefined();
    expect(maskCard(undefined)).toBeUndefined();
  });
  it("toBigInt امن", () => {
    expect(toBigInt(5)).toBe(5n);
    expect(toBigInt("120000")).toBe(120000n);
    expect(toBigInt(1.5)).toBeUndefined();
    expect(toBigInt("12a")).toBeUndefined();
    expect(toBigInt(NaN)).toBeUndefined();
    expect(toBigInt(null)).toBeUndefined();
  });
});

describe("postJson", () => {
  it("خطای شبکه ⇒ unavailable", async () => {
    const { fn } = fakeFetch(() => new Error("ECONNRESET"));
    await expect(postJson("zibal", "https://x", {}, http(fn))).rejects.toThrow(GatewayError);
  });
  it("۵xx و ۴۲۹ ⇒ unavailable؛ ۴xx دیگر برای تحلیل برمی‌گردد", async () => {
    for (const status of [500, 502, 503, 429]) {
      const { fn } = fakeFetch(() => ({ status, body: {} }));
      await expect(postJson("zibal", "https://x", {}, http(fn))).rejects.toThrow(/http/);
    }
    const { fn } = fakeFetch(() => ({ status: 400, body: { error_code: 32 } }));
    expect((await postJson("idpay", "https://x", {}, http(fn))).json).toEqual({ error_code: 32 });
  });
  it("JSON نامعتبر ⇒ unavailable", async () => {
    const { fn } = fakeFetch(() => ({ body: "<html>" }));
    await expect(postJson("zibal", "https://x", {}, http(fn))).rejects.toThrow(/non-json/);
  });
  it("پیام خطا هرگز merchant/کلید را نشت نمی‌دهد", async () => {
    const { fn } = fakeFetch(() => new Error(`connect failed for ${MID}`));
    try {
      await postJson("zarinpal", "https://x", { merchant_id: MID }, http(fn), { "X-API-KEY": "SECRETKEY" });
      throw new Error("should throw");
    } catch (e) {
      expect(String((e as Error).message).includes(MID)).toBe(false);
      expect(String((e as Error).message).includes("SECRETKEY")).toBe(false);
    }
  });
});

// ───────────── زرین‌پال ─────────────
describe("ZarinpalGateway", () => {
  const mk = (f: FetchLike, sandbox = false) => new ZarinpalGateway({ merchantId: MID, sandbox }, http(f));
  const AUTH = "A00000000000000000000000000012345678";

  it("request موفق: مبلغ ریال و شناسه‌ی مبهم می‌رود؛ لینک StartPay ساخته می‌شود", async () => {
    const { fn, calls } = fakeFetch(() => ({ body: { data: { code: 100, message: "Success", authority: AUTH, fee_type: "Merchant", fee: 100 }, errors: [] } }));
    const r = await mk(fn).request({ orderId: ORDER, amountRial: 2_500_000n, callbackUrl: "https://example.ir/payment/callback?appointmentId=a", description: "پرداخت نوبت" });
    expect(r).toEqual({ authority: AUTH, payUrl: `https://payment.zarinpal.com/pg/StartPay/${AUTH}` });
    expect(calls[0]!.url).toBe("https://payment.zarinpal.com/pg/v4/payment/request.json");
    expect(calls[0]!.body).toEqual({
      merchant_id: MID, amount: 2500000, currency: "IRR", description: "پرداخت نوبت",
      callback_url: "https://example.ir/payment/callback?appointmentId=a", metadata: { order_id: ORDER },
    });
  });

  it("sandbox روی میزبان سندباکس می‌رود", async () => {
    const { fn, calls } = fakeFetch(() => ({ body: { data: { code: 100, authority: AUTH }, errors: [] } }));
    const r = await mk(fn, true).request({ orderId: ORDER, amountRial: 100000n, callbackUrl: "https://e.ir/c", description: "d" });
    expect(calls[0]!.url.startsWith("https://sandbox.zarinpal.com/")).toBe(true);
    expect(r.payUrl.startsWith("https://sandbox.zarinpal.com/pg/StartPay/")).toBe(true);
  });

  it("request رد شده (errors.code) ⇒ GatewayError rejected", async () => {
    const { fn } = fakeFetch(() => ({ status: 200, body: { data: [], errors: { code: -9, message: "Validation error" } } }));
    const e = await mk(fn).request({ orderId: ORDER, amountRial: 1n, callbackUrl: "https://e.ir/c", description: "d" }).catch((x) => x);
    expect(e).toBeInstanceOf(GatewayError);
    expect(e.kind).toBe("rejected");
    expect(e.code).toBe("-9");
  });

  it("authority با قالب مشکوک پذیرفته نمی‌شود (جلوگیری از تزریق در URL)", async () => {
    const { fn } = fakeFetch(() => ({ body: { data: { code: 100, authority: "../../evil?x=" }, errors: [] } }));
    await expect(mk(fn).request({ orderId: ORDER, amountRial: 1n, callbackUrl: "https://e.ir/c", description: "d" })).rejects.toThrow(GatewayError);
  });

  it("verify موفق (100) و تکراری (101)", async () => {
    for (const [code, already] of [[100, false], [101, true]] as const) {
      const { fn, calls } = fakeFetch(() => ({ body: { data: { code, message: "Verified", card_pan: "502229******5995", card_hash: "h", ref_id: 201, fee_type: "Merchant", fee: 3000 }, errors: [] } }));
      const o = await mk(fn).verify({ authority: AUTH, orderId: ORDER, amountRial: 2_500_000n });
      expect(o).toEqual({ kind: "PAID", refId: "201", cardPanMasked: "****5995", feeRial: 3000n, alreadyVerified: already });
      expect(calls[0]!.body).toEqual({ merchant_id: MID, amount: 2500000, authority: AUTH });
    }
  });

  it("verify بدون ref_id ⇒ تأیید نمی‌شود", async () => {
    const { fn } = fakeFetch(() => ({ body: { data: { code: 100 }, errors: [] } }));
    await expect(mk(fn).verify({ authority: AUTH, orderId: ORDER, amountRial: 1n })).rejects.toThrow(/ref_id/);
  });

  it("verify: -50 ⇒ MISMATCH، -51 ⇒ NOT_PAID، سایر ⇒ خطا", async () => {
    const run = async (code: number) => {
      const { fn } = fakeFetch(() => ({ body: { data: [], errors: { code, message: "x" } } }));
      return mk(fn).verify({ authority: AUTH, orderId: ORDER, amountRial: 1n });
    };
    expect(await run(-50)).toEqual({ kind: "MISMATCH", code: "-50" });
    expect(await run(-51)).toEqual({ kind: "NOT_PAID", code: "-51" });
    expect(await run(-54)).toEqual({ kind: "NOT_PAID", code: "-54" });
    await expect(run(-10)).rejects.toThrow(GatewayError);
  });

  it("inquire: نگاشت وضعیت‌ها", async () => {
    const run = async (status: string) => {
      const { fn } = fakeFetch(() => ({ body: { data: { code: 100, status }, errors: [] } }));
      return mk(fn).inquire({ authority: AUTH });
    };
    expect((await run("PAID")).kind).toBe("PAID_UNVERIFIED");
    expect((await run("VERIFIED")).kind).toBe("VERIFIED");
    expect((await run("IN_BANK")).kind).toBe("PENDING");
    expect((await run("FAILED")).kind).toBe("FAILED");
    expect((await run("WEIRD")).kind).toBe("UNKNOWN");
  });
});

// ───────────── Zibal ─────────────
describe("ZibalGateway", () => {
  const mk = (f: FetchLike) => new ZibalGateway({ merchant: "m1", sandbox: false }, http(f));

  it("request", async () => {
    const { fn, calls } = fakeFetch(() => ({ body: { trackId: 987654321, result: 100, message: "success" } }));
    const r = await mk(fn).request({ orderId: ORDER, amountRial: 500_000n, callbackUrl: "https://e.ir/c", description: "d" });
    expect(r).toEqual({ authority: "987654321", payUrl: "https://gateway.zibal.ir/start/987654321" });
    expect(calls[0]!.body).toEqual({ merchant: "m1", amount: 500000, callbackUrl: "https://e.ir/c", description: "d", orderId: ORDER });
  });

  it("request رد‌شده", async () => {
    const { fn } = fakeFetch(() => ({ body: { result: 102, message: "merchant یافت نشد" } }));
    await expect(mk(fn).request({ orderId: ORDER, amountRial: 1n, callbackUrl: "https://e.ir/c", description: "d" })).rejects.toThrow(GatewayError);
  });

  const okBody = (over: Record<string, unknown> = {}) => ({ paidAt: "2026-01-01T10:00:00", amount: 500000, result: 100, status: 1, refNumber: 123456, cardNumber: "62741****1234", orderId: ORDER, message: "success", ...over });

  it("verify موفق و تکراری (201)", async () => {
    const a = await mk(fakeFetch(() => ({ body: okBody() })).fn).verify({ authority: "1", orderId: ORDER, amountRial: 500000n });
    expect(a).toEqual({ kind: "PAID", refId: "123456", amountRial: 500000n, cardPanMasked: "****1234", alreadyVerified: false });
    const b = await mk(fakeFetch(() => ({ body: okBody({ result: 201 }) })).fn).verify({ authority: "1", orderId: ORDER, amountRial: 500000n });
    expect(b.kind === "PAID" && b.alreadyVerified).toBe(true);
  });

  it("مبلغ نابرابر / نبودنِ مبلغ / orderId نابرابر ⇒ MISMATCH (fail-closed)", async () => {
    const run = (over: Record<string, unknown>) => mk(fakeFetch(() => ({ body: okBody(over) })).fn).verify({ authority: "1", orderId: ORDER, amountRial: 500000n });
    expect(await run({ amount: 400000 })).toEqual({ kind: "MISMATCH", code: "amount_mismatch", gatewayAmountRial: 400000n });
    expect((await run({ amount: undefined })).kind).toBe("MISMATCH");
    expect(await run({ orderId: "other" })).toMatchObject({ kind: "MISMATCH", code: "order_mismatch" });
  });

  it("پرداخت‌نشده: result 202 یا status != 1", async () => {
    const run = (b: unknown) => mk(fakeFetch(() => ({ body: b })).fn).verify({ authority: "1", orderId: ORDER, amountRial: 500000n });
    expect((await run({ result: 202 })).kind).toBe("NOT_PAID");
    expect((await run(okBody({ status: 2 }))).kind).toBe("NOT_PAID");
    await expect(run({ result: 102 })).rejects.toThrow(GatewayError);
  });

  it("inquire", async () => {
    const run = (status: number, result = 100) => mk(fakeFetch(() => ({ body: { result, status } })).fn).inquire({ authority: "1" });
    expect((await run(1)).kind).toBe("VERIFIED");
    expect((await run(2)).kind).toBe("PAID_UNVERIFIED");
    expect((await run(-1)).kind).toBe("PENDING");
    expect((await run(3)).kind).toBe("FAILED");
    expect((await run(15)).kind).toBe("UNKNOWN"); // برگشت‌خورده ⇒ بررسی انسانی
    expect((await run(0, 203)).kind).toBe("FAILED");
  });
});

// ───────────── IDPay ─────────────
describe("IdpayGateway", () => {
  const KEY = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const ID = "d2e353189823079e1e4181772cff5292";
  const mk = (f: FetchLike, sandbox = false) => new IdpayGateway({ apiKey: KEY, sandbox }, http(f));

  it("request: هدرهای احراز و sandbox", async () => {
    const { fn, calls } = fakeFetch(() => ({ status: 201, body: { id: ID, link: "https://idpay.ir/p/ws/" + ID } }));
    const r = await mk(fn, true).request({ orderId: ORDER, amountRial: 100000n, callbackUrl: "https://e.ir/c", description: "d" });
    expect(r).toEqual({ authority: ID, payUrl: "https://idpay.ir/p/ws/" + ID });
    expect(calls[0]!.headers["X-API-KEY"]).toBe(KEY);
    expect(calls[0]!.headers["X-SANDBOX"]).toBe("1");
    expect(calls[0]!.body).toEqual({ order_id: ORDER, amount: 100000, callback: "https://e.ir/c", desc: "d" });
  });

  it("request: لینک غیر https یا خطا ⇒ rejected", async () => {
    await expect(mk(fakeFetch(() => ({ status: 201, body: { id: ID, link: "http://evil.example/x" } })).fn).request({ orderId: ORDER, amountRial: 1n, callbackUrl: "https://e.ir/c", description: "d" })).rejects.toThrow(GatewayError);
    await expect(mk(fakeFetch(() => ({ status: 406, body: { error_code: 32, error_message: "x" } })).fn).request({ orderId: ORDER, amountRial: 1n, callbackUrl: "https://e.ir/c", description: "d" })).rejects.toThrow(GatewayError);
  });

  const okBody = (over: Record<string, unknown> = {}) => ({ status: 100, track_id: "10012", id: ID, order_id: ORDER, amount: 100000, payment: { track_id: "888001", amount: 100000, card_no: "123456******6759", hashed_card_no: "x", date: 1 }, verify: { date: 2 }, ...over });

  it("verify موفق / تکراری / مبلغ نابرابر", async () => {
    const run = (b: unknown) => mk(fakeFetch(() => ({ body: b })).fn).verify({ authority: ID, orderId: ORDER, amountRial: 100000n });
    expect(await run(okBody())).toEqual({ kind: "PAID", refId: "10012", amountRial: 100000n, cardPanMasked: "****6759", alreadyVerified: false });
    expect(((await run(okBody({ status: 101 }))) as { alreadyVerified: boolean }).alreadyVerified).toBe(true);
    expect(await run(okBody({ amount: 90000, payment: { amount: 90000 } }))).toMatchObject({ kind: "MISMATCH", code: "amount_mismatch" });
  });

  it("verify: error_code 52/53 ⇒ NOT_PAID، 54 ⇒ خطا", async () => {
    const run = (code: number) => mk(fakeFetch(() => ({ status: 405, body: { error_code: code, error_message: "x" } })).fn).verify({ authority: ID, orderId: ORDER, amountRial: 1n });
    expect((await run(52)).kind).toBe("NOT_PAID");
    expect((await run(53)).kind).toBe("NOT_PAID");
    await expect(run(54)).rejects.toThrow(GatewayError);
  });

  it("inquire", async () => {
    const run = (status: number) => mk(fakeFetch(() => ({ body: { status } })).fn).inquire({ authority: ID, orderId: ORDER });
    expect((await run(1)).kind).toBe("PENDING");
    expect((await run(10)).kind).toBe("PAID_UNVERIFIED");
    expect((await run(100)).kind).toBe("VERIFIED");
    expect((await run(200)).kind).toBe("VERIFIED");
    expect((await run(6)).kind).toBe("FAILED");
    expect((await run(77)).kind).toBe("UNKNOWN");
  });
});

// ───────────── Sandbox ─────────────
describe("SandboxGateway", () => {
  it("در production ساخته نمی‌شود", () => {
    expect(() => new SandboxGateway("success", true)).toThrow(/production/);
  });
  it("success: callback با Status=OK و verify موفق با همان مبلغ", async () => {
    const g = new SandboxGateway("success", false);
    const r = await g.request({ orderId: ORDER, amountRial: 100n, callbackUrl: "https://e.ir/payment/callback?appointmentId=a", description: "d" });
    expect(r.authority.startsWith("SANDBOX-")).toBe(true);
    expect(r.payUrl).toContain("&Authority=" + r.authority);
    expect(await g.verify({ authority: r.authority, orderId: ORDER, amountRial: 100n })).toMatchObject({ kind: "PAID", amountRial: 100n });
  });
  it("fail/pending و authority غیر sandbox", async () => {
    const f = new SandboxGateway("fail", false);
    const a = (await f.request({ orderId: ORDER, amountRial: 1n, callbackUrl: "https://e.ir/c", description: "d" })).authority;
    expect((await f.verify({ authority: a, orderId: ORDER, amountRial: 1n })).kind).toBe("NOT_PAID");
    expect((await f.inquire({ authority: a })).kind).toBe("FAILED");
    expect((await new SandboxGateway("pending", false).inquire({ authority: a })).kind).toBe("PENDING");
    expect((await new SandboxGateway("success", false).verify({ authority: "A000REAL", orderId: ORDER, amountRial: 1n })).kind).toBe("NOT_PAID");
  });
});
