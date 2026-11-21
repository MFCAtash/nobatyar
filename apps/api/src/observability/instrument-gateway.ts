import type { Counter, Histogram } from "./metrics";

/**
 * اندازه‌گیری تماس با درگاه‌های پرداخت (SLI ی «در دسترس بودن درگاه»):
 *   result="ok"    ⇒ پاسخ گرفتیم (حتی «پرداخت نشده» یک نتیجه‌ی تجاری معتبر است)
 *   result="error" ⇒ استثنا (قطعی/timeout/۵xx) ⇒ بودجه‌ی خطای SLO ی پرداخت
 * برچسب‌ها فقط gateway و op؛ هیچ شناسه‌ی تراکنش/کاربر.
 */
const OPS = ["request", "verify", "inquire", "refund"] as const;

export interface GatewayMetrics { calls: Pick<Counter, "inc">; duration: Pick<Histogram, "observe"> }

export function instrumentGateway<T extends object>(gw: T & { name: string }, m: GatewayMetrics, now: () => number = () => performance.now()): T {
  return new Proxy(gw, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver) as unknown;
      if (typeof prop !== "string" || !(OPS as readonly string[]).includes(prop) || typeof v !== "function") return v;
      return async (...args: unknown[]) => {
        const t0 = now();
        try {
          const r: unknown = await (v as (...a: unknown[]) => Promise<unknown>).apply(target, args);
          m.calls.inc({ gateway: gw.name, op: prop, result: "ok" });
          return r;
        } catch (e) {
          m.calls.inc({ gateway: gw.name, op: prop, result: "error" });
          throw e;
        } finally {
          m.duration.observe({ gateway: gw.name, op: prop }, (now() - t0) / 1000);
        }
      };
    },
  });
}
