import { describe, expect, it } from "vitest";
import { CircuitBreaker } from "./circuit-breaker";
import { GatewayError } from "./gateway";
import type { GatewayName, PaymentGateway } from "./gateway";
import { AllGatewaysFailedError, GatewayRegistry } from "./gateway-registry";

const INPUT = { orderId: "o", amountRial: 100000n, callbackUrl: "https://e.ir/c", description: "d" };

function stub(name: GatewayName, mode: "ok" | "down" | "reject", log: string[] = []): PaymentGateway {
  return {
    name,
    async request() {
      log.push(name);
      if (mode === "down") throw new GatewayError(name, "unavailable", "down");
      if (mode === "reject") throw new GatewayError(name, "rejected", "bad merchant");
      return { authority: `${name}-auth`, payUrl: `https://${name}/pay` };
    },
    async verify() { return { kind: "NOT_PAID", code: "x" }; },
    async inquire() { return { kind: "PENDING" }; },
  };
}

describe("CircuitBreaker", () => {
  it("بعد از N شکست پیاپی باز می‌شود و پس از cooldown یک آزمایش اجازه می‌دهد", () => {
    let t = 0;
    const b = new CircuitBreaker(3, 60_000, () => t);
    expect(b.canTry("zibal")).toBe(true);
    b.failure("zibal"); b.failure("zibal");
    expect(b.isOpen("zibal")).toBe(false);
    b.failure("zibal");
    expect(b.isOpen("zibal")).toBe(true);
    expect(b.canTry("zibal")).toBe(false);
    t = 59_999;
    expect(b.canTry("zibal")).toBe(false);
    t = 60_000;
    expect(b.canTry("zibal")).toBe(true); // half-open
    expect(b.canTry("zibal")).toBe(false); // فقط «یک» آزمایش
    b.success("zibal");
    expect(b.isOpen("zibal")).toBe(false);
    expect(b.canTry("zibal")).toBe(true);
  });

  it("شکست در حالت half-open مدار را دوباره باز می‌کند؛ موفقیت شمارنده را صفر می‌کند", () => {
    let t = 0;
    const b = new CircuitBreaker(2, 10_000, () => t);
    b.failure("idpay"); b.failure("idpay");
    t = 10_000;
    expect(b.canTry("idpay")).toBe(true);
    b.failure("idpay");
    expect(b.isOpen("idpay")).toBe(true);
    b.success("zarinpal");
    b.failure("zarinpal");
    expect(b.isOpen("zarinpal")).toBe(false);
  });

  it("وضعیت هر درگاه جداست", () => {
    const b = new CircuitBreaker(1, 1000);
    b.failure("zarinpal");
    expect(b.isOpen("zarinpal")).toBe(true);
    expect(b.isOpen("zibal")).toBe(false);
  });
});

describe("GatewayRegistry.requestWithFailover", () => {
  const mk = (gws: PaymentGateway[], over: Partial<ConstructorParameters<typeof GatewayRegistry>[1]> = {}) =>
    new GatewayRegistry(gws, { primary: "zarinpal", fallbacks: ["zibal", "idpay"], breaker: new CircuitBreaker(2, 60_000), isProduction: false, ...over });

  it("درگاه اصلی سالم ⇒ همان؛ جایگزین‌ها لمس نمی‌شوند", async () => {
    const log: string[] = [];
    const r = mk([stub("zarinpal", "ok", log), stub("zibal", "ok", log), stub("idpay", "ok", log)]);
    const out = await r.requestWithFailover(INPUT);
    expect(out.gateway).toBe("zarinpal");
    expect(log).toEqual(["zarinpal"]);
  });

  it("زرین‌پال قطع ⇒ Zibal؛ اگر آن هم قطع ⇒ IDPay", async () => {
    const log: string[] = [];
    const events: string[] = [];
    const r = mk([stub("zarinpal", "down", log), stub("zibal", "down", log), stub("idpay", "ok", log)], {
      onFailover: (i) => events.push(`${i.from}->${i.to}`),
    });
    const out = await r.requestWithFailover(INPUT);
    expect(out.gateway).toBe("idpay");
    expect(log).toEqual(["zarinpal", "zibal", "idpay"]);
    expect(events).toEqual(["zarinpal->zibal", "zibal->idpay"]);
  });

  it("رد صریح (merchant نامعتبر) هم به درگاه بعدی می‌رود", async () => {
    const r = mk([stub("zarinpal", "reject"), stub("zibal", "ok"), stub("idpay", "ok")]);
    expect((await r.requestWithFailover(INPUT)).gateway).toBe("zibal");
  });

  it("همه قطع ⇒ AllGatewaysFailedError با جزئیات", async () => {
    const r = mk([stub("zarinpal", "down"), stub("zibal", "down"), stub("idpay", "reject")]);
    const e = await r.requestWithFailover(INPUT).catch((x) => x);
    expect(e).toBeInstanceOf(AllGatewaysFailedError);
    expect(e.attempts).toEqual([
      { gateway: "zarinpal", kind: "unavailable" },
      { gateway: "zibal", kind: "unavailable" },
      { gateway: "idpay", kind: "rejected" },
    ]);
  });

  it("مدار باز ⇒ درگاه معیوب برای درخواست‌های بعدی رد می‌شود (بدون معطلی)", async () => {
    const log: string[] = [];
    const r = mk([stub("zarinpal", "down", log), stub("zibal", "ok", log), stub("idpay", "ok", log)]);
    await r.requestWithFailover(INPUT); // شکست ۱
    await r.requestWithFailover(INPUT); // شکست ۲ ⇒ مدار باز
    log.length = 0;
    const out = await r.requestWithFailover(INPUT);
    expect(out.gateway).toBe("zibal");
    expect(log).toEqual(["zibal"]); // zarinpal اصلاً صدا زده نشد
  });

  it("اگر مدار «همه» باز باشد، آخرین چاره: همه امتحان می‌شوند", async () => {
    const log: string[] = [];
    const breaker = new CircuitBreaker(1, 60_000);
    const r = mk([stub("zarinpal", "down", log), stub("zibal", "down", log), stub("idpay", "down", log)], { breaker });
    await r.requestWithFailover(INPUT).catch(() => undefined);
    log.length = 0;
    await r.requestWithFailover(INPUT).catch(() => undefined);
    expect(log).toEqual(["zarinpal", "zibal", "idpay"]);
  });

  it("verify/inquire: get(name) همان درگاهِ ثبت‌شده را می‌دهد، نه درگاه اصلی", () => {
    const z = stub("zibal", "ok");
    const r = mk([stub("zarinpal", "ok"), z, stub("idpay", "ok")]);
    // get() اکنون پروکسی ی اندازه‌گیری (instrumentGateway) برمی‌گرداند؛ هویت شیء عوض شده ولی همان درگاه است
    expect(r.get("zibal")?.name).toBe("zibal");
    expect(r.get("zibal")).not.toBe(r.get("zarinpal"));
    expect(r.get("sandbox")).toBeUndefined();
  });

  it("در production ثبت sandbox ممنوع و get(sandbox) همیشه undefined", () => {
    expect(() => mk([stub("sandbox", "ok")], { primary: "sandbox", fallbacks: [], isProduction: true })).toThrow(/sandbox/);
  });

  it("درگاهِ اصلی/جایگزینِ ثبت‌نشده ⇒ خطا در ساخت", () => {
    expect(() => mk([stub("zibal", "ok")])).toThrow(/primary/);
    expect(() => mk([stub("zarinpal", "ok")])).toThrow(/fallback/);
  });
});
