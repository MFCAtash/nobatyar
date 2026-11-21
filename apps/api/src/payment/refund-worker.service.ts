import { Logger } from "@nestjs/common";
import type { AuthUser } from "../common/decorators";
import { RefundService } from "./refund.service";
import type { RefundWorkerConfig } from "./refund-worker.config";

/** شناسهٔ SYSTEM برای ثبت audit — هیچ کاربر واقعیای با این id وجود ندارد.
 * RefundService اگر dual-approval لازم باشد، بدون تأیید معتبر تماس درگاه نمیزند ⇒ worker نمیتواند چهارچشمی را دور بزند.
 */
export const REFUND_WORKER_ACTOR_ID = "00000000-0000-4000-8000-000000000000";
const SYSTEM_ACTOR: AuthUser = { id: REFUND_WORKER_ACTOR_ID, role: "ADMIN", sid: "refund-worker", iatMs: 0 };

export interface RefundWorkerResult {
  enabled: boolean;
  swept: number;
  attempted: number;
  processed: number;
  failed: number;
}

/**
 * M4: اجرای خودکار استردادهای تأییدشده — پشت feature flag، بدون retry روی نتیجهٔ مبهم.
 * تمام نوشتها از مسیر RefundService.execute میگذرند (claim اتمیک + RLS + Audit + Outbox).
 */
export class RefundWorkerService {
  private readonly log = new Logger(RefundWorkerService.name);

  constructor(
    private readonly refunds: RefundService,
    private readonly cfg: RefundWorkerConfig,
  ) {}

  async run(now: Date = new Date()): Promise<RefundWorkerResult> {
    const empty: RefundWorkerResult = { enabled: false, swept: 0, attempted: 0, processed: 0, failed: 0 };
    if (!this.cfg.enabled) return empty;

    const swept = await this.refunds.sweepStale(now);
    const candidates = (await this.refunds.list("PENDING", this.cfg.batch, now)).filter((r) => {
      const ageMin = (now.getTime() - new Date(r.createdAt).getTime()) / 60_000;
      return ageMin >= this.cfg.minAgeMin && r.tryCount < this.cfg.maxTry;
    });

    let processed = 0, failed = 0;
    for (const c of candidates) {
      try {
        const res = await this.refunds.execute(SYSTEM_ACTOR, c.id, now);
        if (res.status === "PROCESSED") processed++;
        else if (res.status === "REVIEW" || res.status === "MANUAL") failed++;
        else failed++;
      } catch {
        // رقابت با ادمین یا نمونهٔ دیگر ⇒ خطای قابل انتظار؛ تلاش بعدی در tick بعدی (تا maxTry)
        failed++;
      }
    }
    const result: RefundWorkerResult = { enabled: true, swept, attempted: candidates.length, processed, failed };
    if (candidates.length) this.log.log(`refund worker tick: ${JSON.stringify(result)}`);
    return result;
  }
}
