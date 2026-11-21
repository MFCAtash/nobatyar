import { Logger } from "@nestjs/common";
import type { PaymentConfig } from "../payment.config";
import { CircuitBreaker } from "./circuit-breaker";
import type { FetchLike } from "./http";
import { GatewayRegistry } from "./gateway-registry";
import type { PaymentGateway } from "./gateway";
import { IdpayGateway } from "./idpay.gateway";
import { SandboxGateway } from "./sandbox.gateway";
import { ZarinpalGateway } from "./zarinpal.gateway";
import { ZibalGateway } from "./zibal.gateway";

/**
 * ساخت مسیریاب از روی تنظیمات.
 * «همه‌ی» درگاه‌هایی که مشخصاتشان هست ساخته می‌شوند (نه فقط اصلی/جایگزین): تراکنشی که روی درگاه X شروع شده
 * باید حتی پس از تغییر درگاه اصلی هنوز روی X قابل verify/inquire باشد.
 */
export function buildGatewayRegistry(cfg: PaymentConfig, fetchFn?: FetchLike): GatewayRegistry {
  const http = { timeoutMs: cfg.httpTimeoutMs, fetchFn };
  const gateways: PaymentGateway[] = [];
  if (cfg.zarinpal) gateways.push(new ZarinpalGateway(cfg.zarinpal, http));
  if (cfg.zibal) gateways.push(new ZibalGateway(cfg.zibal, http));
  if (cfg.idpay) gateways.push(new IdpayGateway(cfg.idpay, http));
  if (!cfg.isProduction && cfg.primary === "sandbox") gateways.push(new SandboxGateway(cfg.sandboxMode, false));

  const log = new Logger("PaymentGateway");
  return new GatewayRegistry(gateways, {
    primary: cfg.primary,
    fallbacks: cfg.fallbacks,
    isProduction: cfg.isProduction,
    breaker: new CircuitBreaker(cfg.breakerFailures, cfg.breakerCooldownSec * 1000),
    onGatewayError: (i) => log.warn(`${i.gateway} request failed (${i.kind}): ${i.message}`),
    onFailover: (i) => log.error(`FAILOVER ${i.from} → ${i.to} (${i.kind})`),
  });
}
