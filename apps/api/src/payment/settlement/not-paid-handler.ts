import type { Logger } from "@nestjs/common";
import type { InquiryOutcome } from "../gateway/gateway";
import type { GatewayRegistry } from "../gateway/gateway-registry";
import { afterNotPaid, fromDbGateway } from "../payment-policy";
import type { AttemptCloser } from "./attempt-closer";
import type { AttemptRow, SettleResult, SettleSource } from "./types";

/** verify می‌گوید «پرداخت نشده»: فقط استعلام درگاه تصمیم می‌گیرد (نه Status مرورگر). */
export async function handleNotPaid(
  deps: { registry: GatewayRegistry; closer: AttemptCloser; giveUpHours: number; log: Logger; retryVerify: (a: AttemptRow) => Promise<SettleResult> },
  a: AttemptRow, code: string, source: SettleSource, now: Date, allowRetry: boolean,
): Promise<SettleResult> {
  const gw = deps.registry.get(fromDbGateway(a.gateway))!;
  let inq: InquiryOutcome | null = null;
  try {
    inq = await gw.inquire({ authority: a.authority, orderId: a.id });
  } catch (e) {
    deps.log.warn(`inquire failed (${a.gateway}) attempt=${a.id}: ${(e as Error).message}`);
  }
  const ageMs = now.getTime() - a.createdAt.getTime();
  const action = afterNotPaid(inq, ageMs, deps.giveUpHours * 3_600_000);

  switch (action) {
    case "RETRY_VERIFY":
      // درگاه می‌گوید پرداخت شده ولی verify «نشده» گفت ⇒ رقابت/تأخیر درگاه. فقط یک بار دیگر.
      return allowRetry ? deps.retryVerify(a) : { state: "PENDING", code: "verify_inconsistent" };
    case "FAIL":
      await deps.closer.close(a, "FAILED", inq && inq.kind === "FAILED" ? inq.code : code, now, source !== "callback");
      return { state: "FAILED", code: "gateway_failed" };
    case "EXPIRE":
      await deps.closer.close(a, "EXPIRED", "not_paid_after_giveup", now, true);
      return { state: "FAILED", code: "expired" };
    case "REVIEW":
      return deps.closer.markMismatch(a, "unknown_status_after_giveup", undefined, now);
    case "WAIT":
      return { state: "PENDING", code: "awaiting_gateway" };
  }
}
