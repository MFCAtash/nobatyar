import { GatewayError } from "./gateway";
import type { GatewayName, PaymentGateway, RealGatewayName, RequestInput, RequestResult } from "./gateway";
import type { CircuitBreaker } from "./circuit-breaker";
import { gatewayCalls, gatewayDuration } from "../../observability/metrics";
import { instrumentGateway } from "../../observability/instrument-gateway";

export class AllGatewaysFailedError extends Error {
  constructor(readonly attempts: { gateway: GatewayName; kind: string }[]) {
    super(`all payment gateways failed: ${attempts.map((a) => `${a.gateway}:${a.kind}`).join(", ") || "none configured"}`);
    this.name = "AllGatewaysFailedError";
  }
}

export interface RegistryOptions {
  primary: GatewayName;
  fallbacks: RealGatewayName[];
  breaker: CircuitBreaker;
  isProduction: boolean;
  onFailover?: (info: { from: GatewayName; to: GatewayName; kind: string }) => void;
  onGatewayError?: (info: { gateway: GatewayName; kind: string; message: string }) => void;
}

/**
 * مسیریاب درگاه‌ها (Strategy + failover).
 *
 *  - request (شروع پرداخت): اول درگاه اصلی؛ اگر «در دسترس نیست» (یا رد کرد) ⇒ بعدی در لیست. مدار باز ⇒ رد می‌شود.
 *  - verify / inquire «هرگز» failover ندارند: هر تراکنش را فقط همان درگاهی می‌تواند تأیید کند که ساخته؛
 *    از طریق `get(name)` به درگاهِ ثبت‌شده در attempt می‌رسیم، نه درگاه اصلیِ فعلی.
 */
export class GatewayRegistry {
  private readonly byName = new Map<GatewayName, PaymentGateway>();

  constructor(gateways: PaymentGateway[], private readonly opts: RegistryOptions) {
    for (const g of gateways) {
      if (opts.isProduction && g.name === "sandbox") throw new Error("sandbox gateway must never be registered in production");
      this.byName.set(g.name, instrumentGateway(g, { calls: gatewayCalls, duration: gatewayDuration })); // SLI ی درگاه (نرخ خطا/تأخیر)
    }
    if (!this.byName.has(opts.primary)) throw new Error(`primary gateway "${opts.primary}" is not registered`);
    for (const f of opts.fallbacks) if (!this.byName.has(f)) throw new Error(`fallback gateway "${f}" is not registered`);
  }

  get(name: GatewayName): PaymentGateway | undefined {
    if (this.opts.isProduction && name === "sandbox") return undefined;
    return this.byName.get(name);
  }

  /** ترتیب تلاش برای request. */
  order(): GatewayName[] {
    return [this.opts.primary, ...this.opts.fallbacks];
  }

  async requestWithFailover(input: RequestInput): Promise<{ gateway: GatewayName; result: RequestResult }> {
    const all = this.order();
    // مدارِ باز کنار گذاشته می‌شود؛ اگر «همه» باز بودند، آخرین چاره: همه را به ترتیب امتحان کن
    let candidates = all.filter((g) => this.opts.breaker.canTry(g));
    if (candidates.length === 0) candidates = all;

    const failures: { gateway: GatewayName; kind: string }[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const name = candidates[i]!;
      const gw = this.byName.get(name)!;
      try {
        const result = await gw.request(input);
        this.opts.breaker.success(name);
        return { gateway: name, result };
      } catch (e) {
        const kind = e instanceof GatewayError ? e.kind : "unavailable";
        const message = e instanceof Error ? e.message : String(e);
        this.opts.breaker.failure(name);
        failures.push({ gateway: name, kind });
        this.opts.onGatewayError?.({ gateway: name, kind, message });
        const next = candidates[i + 1];
        if (next) this.opts.onFailover?.({ from: name, to: next, kind });
      }
    }
    throw new AllGatewaysFailedError(failures);
  }
}
