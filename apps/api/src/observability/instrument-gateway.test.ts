import { describe, expect, it } from "vitest";
import { instrumentGateway } from "./instrument-gateway";

function sink() {
  const calls: Record<string, string>[] = []; const durs: { l: Record<string, string>; v: number }[] = [];
  return { calls, durs, m: { calls: { inc: (l?: Record<string, string>) => void calls.push(l ?? {}) }, duration: { observe: (l: Record<string, string>, v: number) => void durs.push({ l, v }) } } };
}

class FakeGw {
  readonly name = "zarinpal";
  secret = "s";
  async request() { return { ok: true, self: this.secret }; }
  async verify(): Promise<never> { throw new Error("timeout"); }
  helper() { return "plain"; }
}

describe("instrumentGateway", () => {
  it("موفق ⇒ result=ok، زمان ثبت، و `this` درست می‌ماند", async () => {
    const s = sink();
    let t = 1000;
    const gw = instrumentGateway(new FakeGw(), s.m, () => (t += 250));
    expect(await gw.request()).toEqual({ ok: true, self: "s" });
    expect(s.calls).toEqual([{ gateway: "zarinpal", op: "request", result: "ok" }]);
    expect(Math.abs(s.durs[0]!.v - 0.25) < 1e-9).toBe(true);
  });
  it("استثنا ⇒ result=error و دوباره پرتاب", async () => {
    const s = sink();
    const gw = instrumentGateway(new FakeGw(), s.m);
    await expect(gw.verify()).rejects.toThrow("timeout");
    expect(s.calls).toEqual([{ gateway: "zarinpal", op: "verify", result: "error" }]);
    expect(s.durs).toHaveLength(1);
  });
  it("متدهای غیر از عملیات درگاه و فیلدها دست‌نخورده‌اند (بدون متریک)", () => {
    const s = sink();
    const gw = instrumentGateway(new FakeGw(), s.m);
    expect(gw.helper()).toBe("plain");
    expect(gw.name).toBe("zarinpal");
    expect(s.calls).toHaveLength(0);
  });
});
