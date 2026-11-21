import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PAYMENT_CONFIG } from "../payment/payment.config";
import type { PaymentConfig } from "../payment/payment.config";
import { PaymentReconciler } from "../payment/payment-reconciler";
import { SecondOpinionService } from "../second-opinion/second-opinion.service";
import { IdempotencyPurger } from "../idempotency/idempotency-purger";
import { OutboxRelayService } from "../outbox/outbox-relay.service";
import { AppointmentJobs } from "./appointment-jobs";
import { ScribeService } from "../scribe/scribe.service";
import { scribePurged } from "../observability/metrics";
import { DataRequestService } from "../records/data-request.service";
import { AppointmentsService } from "../appointments/appointments.service";
import { WaitlistService } from "../appointments/waitlist.service";
import { AuditVerifierService } from "../audit/audit-verifier.service";
import { RefundWorkerService } from "../payment/refund-worker.service";
import { REFUND_WORKER_CONFIG, type RefundWorkerConfig } from "../payment/refund-worker.config";

/** BullMQ: یک job تکرارشونده (هر ۶۰ ثانیه). فقط وقتی ENABLE_WORKERS=true؛ برای اجرا در یک نمونه‌ی مجزا (worker). */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(SchedulerService.name);
  private closers: Array<() => Promise<unknown>> = [];
  private lastAuditVerify = 0;

  constructor(
    @Inject(AppointmentJobs) private readonly jobs: AppointmentJobs,
    @Inject(SecondOpinionService) private readonly secondOpinions: SecondOpinionService,
    @Inject(PaymentReconciler) private readonly payments: PaymentReconciler,
    @Inject(PAYMENT_CONFIG) private readonly paymentCfg: PaymentConfig,
    @Inject(OutboxRelayService) private readonly outbox: OutboxRelayService,
    @Inject(IdempotencyPurger) private readonly idempotency: IdempotencyPurger,
    @Inject(ScribeService) private readonly scribe: ScribeService,
    @Inject(DataRequestService) private readonly dataRequests: DataRequestService,
    @Inject(AppointmentsService) private readonly appointments: AppointmentsService,
    @Inject(WaitlistService) private readonly waitlist: WaitlistService,
    @Inject(AuditVerifierService) private readonly auditVerifier: AuditVerifierService,
    @Inject(RefundWorkerService) private readonly refunds: RefundWorkerService,
    @Inject(REFUND_WORKER_CONFIG) private readonly refundCfg: RefundWorkerConfig,
  ) {}

  async onModuleInit() {
    if (process.env.ENABLE_WORKERS !== "true") return;
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL is required when ENABLE_WORKERS=true");

    const { Queue, Worker } = await import("bullmq");
    const { default: IORedis } = await import("ioredis");
    const connection = new IORedis(url, { maxRetriesPerRequest: null });

    const queue = new Queue("maintenance", { connection });
    await queue.add("appointments-tick", {}, { repeat: { every: 60_000 }, jobId: "appointments-tick", removeOnComplete: 10, removeOnFail: 50 });
    const worker = new Worker("maintenance", async () => {
      await this.jobs.tick();
      await this.secondOpinions.expireStale();
      const { purged } = await this.scribe.purgeExpired(); // A4: پاکسازی TTL متن موقت Scribe
      if (purged > 0) scribePurged.inc({}, purged);
      await this.dataRequests.processDue(); // A6: درخواستهای تأییدشده و رسیده به موعد
      await this.appointments.scoreRisks(); // A11: امتیاز غیبت (توضیحپذیر)
      await this.waitlist.expireStale(); // A24: انقضای لیست انتظار
      if (Date.now() - this.lastAuditVerify > 86_400_000) { this.lastAuditVerify = Date.now(); await this.auditVerifier.verify(); } // فاز ۸: انقضای نظر دوم بی‌پاسخ
    }, { connection, concurrency: 1 });
    worker.on("failed", (_job, err) => this.log.error(`maintenance job failed: ${err.message}`));

    // صف جدا برای بازبینی پرداخت: کندیِ درگاه نباید tick ی نوبت‌ها را معطل کند
    const payQueue = new Queue("payments", { connection });
    const every = this.paymentCfg.reconcileEverySec * 1000;
    for (const r of await payQueue.getRepeatableJobs()) {
      if (r.name === "payments-reconcile" && Number(r.every) !== every) await payQueue.removeRepeatableByKey(r.key); // تغییر فاصله ⇒ تکرارشونده‌ی قدیمی حذف
    }
    await payQueue.add("payments-reconcile", {}, { repeat: { every }, jobId: "payments-reconcile", removeOnComplete: 10, removeOnFail: 50 });
    const payWorker = new Worker("payments", async () => { await this.payments.run(); }, { connection, concurrency: 1 });
    payWorker.on("failed", (_job, err) => this.log.error(`payments reconcile job failed: ${err.message}`));

    // صف جدا برای Outbox: تحویل اعلان‌ها هر ۵ ثانیه (+ پاکسازی کلیدهای Idempotency ی منقضی هر ساعت)
    const outQueue = new Queue("outbox", { connection });
    const outEvery = Number(process.env.OUTBOX_RELAY_EVERY_MS ?? 5000);
    if (!Number.isInteger(outEvery) || outEvery < 1000 || outEvery > 60_000) throw new Error("OUTBOX_RELAY_EVERY_MS must be an integer in [1000, 60000]");
    for (const r of await outQueue.getRepeatableJobs()) {
      if (r.name === "outbox-relay" && Number(r.every) !== outEvery) await outQueue.removeRepeatableByKey(r.key);
    }
    await outQueue.add("outbox-relay", {}, { repeat: { every: outEvery }, jobId: "outbox-relay", removeOnComplete: 10, removeOnFail: 50 });
    let lastIdemPurge = 0;
    const outWorker = new Worker("outbox", async () => {
      await this.outbox.tick();
      if (Date.now() - lastIdemPurge > 3_600_000) { lastIdemPurge = Date.now(); await this.idempotency.purgeExpired(new Date()); }
    }, { connection, concurrency: 1 });
    outWorker.on("failed", (_job, err) => this.log.error(`outbox relay job failed: ${err.message}`));

    // صف جدا برای استرداد خودکار (M4): فقط وقتی flag روشن است؛ از RefundService.execute با claim اتمیک عبور میکند.
    if (this.refundCfg.enabled) {
      const refundQueue = new Queue("refunds", { connection });
      for (const r of await refundQueue.getRepeatableJobs()) {
        if (r.name === "refund-worker-tick" && Number(r.every) !== this.refundCfg.everyMs) await refundQueue.removeRepeatableByKey(r.key);
      }
      await refundQueue.add("refund-worker-tick", {}, { repeat: { every: this.refundCfg.everyMs }, jobId: "refund-worker-tick", removeOnComplete: 10, removeOnFail: 50 });
      const refundWorker = new Worker("refunds", async () => { await this.refunds.run(); }, { connection, concurrency: 1 });
      refundWorker.on("failed", (_job, err) => this.log.error(`refund worker job failed: ${err.message}`));
      this.closers = [() => refundWorker.close(), () => refundQueue.close(), ...this.closers];
      this.log.log("refund worker started");
    }

    this.closers = [() => worker.close(), () => payWorker.close(), () => outWorker.close(), () => queue.close(), () => payQueue.close(), () => outQueue.close(), async () => connection.quit(), ...this.closers];
    this.log.log("maintenance worker started");
  }

  async onModuleDestroy() {
    await Promise.allSettled(this.closers.map((c) => c()));
  }
}
