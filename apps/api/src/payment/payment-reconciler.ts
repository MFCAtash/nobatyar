import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PAYMENT_CONFIG } from "./payment.config";
import type { PaymentConfig } from "./payment.config";
import { PaymentSettlement } from "./payment-settlement";
import { reconcileCutoffs } from "./payment-policy";

const BATCH = 100;
/** پس از PAID شدن، اگر این‌قدر هنوز با نوبت هماهنگ نشده، job ترمیم وارد می‌شود (پروسه وسط کار مُرده). */
const HEAL_AFTER_MS = 2 * 60_000;

export interface ReconcileSummary { checked: number; paid: number; failed: number; pending: number; review: number; healed: number }

/**
 * job ی بازبینی (BullMQ، SchedulerService): پرداخت‌های INITIATED قدیمی‌تر از PAYMENT_RECONCILE_AFTER_MIN (۱۵ دقیقه)
 * را از «خود درگاه» استعلام و در صورت پرداخت‌شدن نهایی می‌کند ⇒ پوشش کاربری که پس از پرداخت به سایت برنگشته.
 * ایدمپوتنت و امن برای چند نمونه‌ی هم‌زمان: «اول ادعا (claim)، بعد استعلام».
 */
@Injectable()
export class PaymentReconciler {
  private readonly log = new Logger(PaymentReconciler.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PaymentSettlement) private readonly settlement: PaymentSettlement,
    @Inject(PAYMENT_CONFIG) private readonly cfg: PaymentConfig,
  ) {}

  async run(now: Date = new Date()): Promise<ReconcileSummary> {
    const s: ReconcileSummary = { checked: 0, paid: 0, failed: 0, pending: 0, review: 0, healed: 0 };
    const { createdBefore, checkedBefore } = reconcileCutoffs(now, this.cfg.reconcileAfterMin);

    const due = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.paymentAttempt.findMany({
        where: {
          status: "INITIATED",
          createdAt: { lte: createdBefore },
          OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: checkedBefore } }],
        },
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take: BATCH,
      }),
    );

    for (const { id } of due) {
      const claimed = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
        tx.paymentAttempt.updateMany({
          where: { id, status: "INITIATED", OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: checkedBefore } }] },
          data: { lastCheckedAt: now, checkCount: { increment: 1 } },
        }),
      );
      if (claimed.count !== 1) continue; // نمونه‌ی دیگری برداشت
      s.checked++;
      try {
        const r = await this.settlement.settle(id, "reconcile", null, now);
        if (r.state === "PAID") s.paid++;
        else if (r.state === "FAILED") s.failed++;
        else if (r.state === "REVIEW") s.review++;
        else s.pending++;
      } catch (e) {
        s.pending++;
        this.log.error(`reconcile failed for attempt ${id}: ${(e as Error).message}`);
      }
    }

    s.healed = await this.heal(now);
    if (s.checked || s.healed) this.log.log(`reconcile: ${JSON.stringify(s)}`);
    return s;
  }

  /** PAID ولی هماهنگی با نوبت ناتمام ⇒ دوباره هماهنگ کن (ایدمپوتنت). */
  private async heal(now: Date): Promise<number> {
    const rows = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.payment.findMany({
        where: { status: "PAID", appointmentSyncedAt: null, paidAt: { lte: new Date(now.getTime() - HEAL_AFTER_MS) } },
        select: { id: true },
        orderBy: { paidAt: "asc" },
        take: BATCH,
      }),
    );
    let n = 0;
    for (const { id } of rows) {
      try {
        const r = await this.settlement.syncAppointment(id, now);
        if (r !== "SKIPPED") n++;
      } catch (e) {
        this.log.error(`heal failed for payment ${id}: ${(e as Error).message}`);
      }
    }
    return n;
  }
}
