import { setSpanAttributes, withSpan } from "../observability/tracing";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../common/decorators";
import { OUTBOX_WRITER, type OutboxWriter } from "../outbox/outbox.service";
import { PrismaService } from "../prisma/prisma.service";
import { GatewayError } from "./gateway/gateway";
import type { RefundOutcome } from "./gateway/gateway";
import { GatewayRegistry } from "./gateway/gateway-registry";
import { refundExec } from "../observability/metrics";
import { fromDbGateway } from "./payment-policy";
import { APPROVAL_DISABLED, canConsume, canDecide, canRequest, requiresDualApproval } from "./refund-approval-policy";
import type { ApprovalAction, ApprovalConfig, ApprovalState, Denial, RefundApprovalFacts, Verdict } from "./refund-approval-policy";
import { EXECUTABLE_STATUSES, MARKABLE_STATUSES } from "./refund-statuses";

/** تنظیم تأیید دو نفره (از PaymentConfig ساخته می‌شود؛ PaymentModule). */
export const REFUND_APPROVAL_CONFIG = Symbol("REFUND_APPROVAL_CONFIG");

/** حالت‌هایی که ادمین می‌تواند از آن‌ها «اجرا» کند. REVIEW عمداً نیست: ممکن است درگاه قبلاً ثبت کرده باشد. */
export const EXECUTABLE = EXECUTABLE_STATUSES;
/** حالت‌هایی که ادمین می‌تواند «انجام‌شده (دستی)» ثبت کند. */
export const MARKABLE = MARKABLE_STATUSES;
/** PROCESSING ی قدیمی‌تر از این (دقیقه) یعنی نتیجه نامعلوم ⇒ REVIEW. */
export const STALE_PROCESSING_MIN = 10;

export interface RefundView {
  id: string; status: string; amountRial: string; reason: string | null;
  gateway: string | null; externalRef: string | null; tryCount: number; lastErrorCode: string | null;
  createdAt: string; processedAt: string | null; note: string | null;
  paymentId: string; appointmentId: string; attemptId: string | null; patientName: string | null;
  /** تأیید دو نفره: وضعیت جاری و عوامل (Maker/Checker) */
  approval: { required: boolean; state: string; action: string | null; reference: string | null; makerId: string | null; makerNote: string | null; requestedAt: string | null; checkerId: string | null; checkerNote: string | null; decidedAt: string | null };
}

const SELECT = {
  id: true, status: true, amountRial: true, reason: true, gateway: true, externalRef: true, tryCount: true, lastErrorCode: true,
  createdAt: true, processedAt: true, note: true, paymentId: true, attemptId: true,
  approvalState: true, approvalAction: true, approvalRef: true, makerId: true, makerNote: true, requestedAt: true, checkerId: true, checkerNote: true, decidedAt: true,
  payment: { select: { appointmentId: true, appointment: { select: { patient: { select: { fullName: true } } } } } },
} as const;

type Row = {
  id: string; status: string; amountRial: bigint; reason: string | null; gateway: string | null; externalRef: string | null;
  tryCount: number; lastErrorCode: string | null; createdAt: Date; processedAt: Date | null; note: string | null; paymentId: string; attemptId: string | null;
  approvalState?: string; approvalAction?: string | null; approvalRef?: string | null; makerId?: string | null; makerNote?: string | null; requestedAt?: Date | null; checkerId?: string | null; checkerNote?: string | null; decidedAt?: Date | null;
  payment: { appointmentId: string; appointment?: { patient?: { fullName?: string } | null } | null };
};

export function toView(r: Row, cfg: ApprovalConfig = APPROVAL_DISABLED): RefundView {
  return {
    id: r.id, status: r.status, amountRial: r.amountRial.toString(), reason: r.reason, gateway: r.gateway, externalRef: r.externalRef,
    tryCount: r.tryCount, lastErrorCode: r.lastErrorCode, createdAt: r.createdAt.toISOString(), processedAt: r.processedAt?.toISOString() ?? null,
    note: r.note, paymentId: r.paymentId, appointmentId: r.payment.appointmentId, attemptId: r.attemptId,
    patientName: r.payment.appointment?.patient?.fullName ?? null,
    approval: {
      required: requiresDualApproval(r.amountRial, cfg), state: r.approvalState ?? "NONE", action: r.approvalAction ?? null, reference: r.approvalRef ?? null,
      makerId: r.makerId ?? null, makerNote: r.makerNote ?? null, requestedAt: r.requestedAt?.toISOString() ?? null,
      checkerId: r.checkerId ?? null, checkerNote: r.checkerNote ?? null, decidedAt: r.decidedAt?.toISOString() ?? null,
    },
  };
}

/**
 * اجرای استرداد وجه (فقط ادمین). اصل‌ها:
 *  ۱) «claim» اتمیک (PENDING|FAILED|MANUAL → PROCESSING) ⇒ دو ادمین/دو درخواست هم‌زمان هرگز دو بار به درگاه نمی‌روند.
 *  ۲) نتیجه‌ی مبهم (timeout/۵xx/پاسخ نامفهوم) ⇒ REVIEW و «هرگز» تلاش خودکار/تکراری (درگاه ممکن است ثبت کرده باشد؛ API ایدمپوتنت ندارد).
 *  ۳) درگاه بدون API/توکن/مبلغ زیر حداقل ⇒ MANUAL: ادمین از پنل درگاه انجام می‌دهد و مرجع را ثبت می‌کند.
 *  ۴) PROCESSED نهایی است (تریگر DB) و هر اقدام در Audit ثبت می‌شود. سقف مبلغ را تریگر DB نگه می‌دارد.
 *  ۵) فقط داده‌ی مالی؛ هیچ داده‌ی سلامت (دلیل مراجعه و …) خوانده یا به درگاه فرستاده نمی‌شود.
 */
@Injectable()
export class RefundService {
  private readonly log = new Logger(RefundService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OUTBOX_WRITER) private readonly outbox: OutboxWriter,
    @Inject(GatewayRegistry) private readonly gateways: GatewayRegistry,
    @Inject(REFUND_APPROVAL_CONFIG) private readonly approval: ApprovalConfig = APPROVAL_DISABLED,
  ) {}

  async list(status: string | undefined, limit = 50, now: Date = new Date()): Promise<RefundView[]> {
    await this.sweepStale(now);
    const rows = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.refund.findMany({ where: status ? { status: status as never } : {}, orderBy: { createdAt: "asc" }, take: limit, select: SELECT }),
    );
    return (rows as Row[]).map((r) => toView(r, this.approval));
  }

  /** PROCESSING ی بی‌نتیجه (مثلاً crash بین پاسخ درگاه و ثبت در DB) ⇒ REVIEW تا دستی بررسی شود. */
  async sweepStale(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - STALE_PROCESSING_MIN * 60_000);
    const r = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.refund.updateMany({ where: { status: "PROCESSING", claimedAt: { lt: cutoff } }, data: { status: "REVIEW", lastErrorCode: "stale_processing" } }),
    );
    if (r.count > 0) this.log.error(`${r.count} refund(s) stuck in PROCESSING moved to REVIEW`);
    return r.count;
  }

  /** اجرای استرداد — span ی «refund.execute». */
  execute(admin: AuthUser, id: string, now: Date = new Date()): Promise<RefundView> {
    return withSpan("refund.execute", { "refund.id": id, "refund.action": "EXECUTE" }, async (span) => {
      const r = await this.executeInner(admin, id, now);
      setSpanAttributes(span, { "refund.outcome": r.status });
      return r;
    });
  }

  private async executeInner(admin: AuthUser, id: string, now: Date): Promise<RefundView> {
    // ۰) تأیید دو نفره: بدون تأیید معتبر «برای همین اقدام» هیچ تماسی با درگاه گرفته نمی‌شود
    const facts = await this.readFacts(id);
    this.assertVerdict(canConsume(facts, "EXECUTE", undefined, this.approval));
    const dual = requiresDualApproval(facts.amountRial, this.approval);

    // ۱) claim اتمیک + خواندن اطلاعات لازم برای درگاه
    const claimed = await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const won = await tx.refund.updateMany({
        where: { id, status: { in: [...EXECUTABLE] as never }, ...(dual ? { approvalState: "APPROVED" as never, approvalAction: "EXECUTE" as never } : {}) },
        data: { status: "PROCESSING", claimedAt: now, tryCount: { increment: 1 }, lastErrorCode: null },
      });
      if (won.count !== 1) return null;
      await this.audit.logIn(tx, { actorId: admin.id, actorRole: "ADMIN", action: "refund.execute_started", objectType: "refund", objectId: id, meta: dual ? { makerId: facts.makerId, checkerId: facts.checkerId } : {} });
      return tx.refund.findUnique({
        where: { id },
        select: {
          id: true, amountRial: true, attemptId: true,
          payment: { select: { id: true, appointmentId: true, attempts: { select: { id: true, gateway: true, authority: true, status: true } } } },
        },
      });
    });
    if (!claimed) {
      const exists = await this.prisma.withContext({ role: "SYSTEM" }, (tx) => tx.refund.findUnique({ where: { id }, select: { status: true } }));
      if (!exists) throw new NotFoundException();
      throw new ConflictException({ error: "refund_not_executable", message: "refund_not_executable", status: exists.status });
    }

    // ۲) تلاشِ تأییدشده‌ای که پول را گرفته
    type Att = { id: string; gateway: string; authority: string; status: string };
    const attempts = claimed.payment.attempts as Att[];
    const att = claimed.attemptId ? attempts.find((a) => a.id === claimed.attemptId) : attempts.find((a) => a.status === "VERIFIED");

    // ۳) فراخوانی درگاه «خارج از تراکنش DB»
    let outcome: RefundOutcome | { kind: "AMBIGUOUS"; code: string };
    const gw = att ? this.gateways.get(fromDbGateway(att.gateway)) : undefined;
    if (!att) outcome = { kind: "UNSUPPORTED", reason: "no_api" };
    else if (!gw || !gw.refund) outcome = { kind: "UNSUPPORTED", reason: "no_api" };
    else {
      try {
        outcome = await gw.refund({ authority: att.authority, orderId: att.id, amountRial: claimed.amountRial, description: "استرداد وجه نوبت" });
      } catch (e) {
        outcome = { kind: "AMBIGUOUS", code: e instanceof GatewayError ? `gateway_${e.kind}` : "unexpected_error" };
        this.log.error(`refund ${id}: ambiguous gateway result (${(outcome as { code: string }).code}) ⇒ REVIEW`);
      }
    }

    // ۴) ثبت نتیجه (شرطی: فقط اگر هنوز PROCESSING باشد)
    const gwName = att ? (att.gateway as never) : undefined;
    const final = await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      let data: Record<string, unknown>;
      let action: string;
      switch (outcome.kind) {
        case "ACCEPTED":
          data = { status: "PROCESSED", externalRef: outcome.externalRef, processedAt: now, processedBy: admin.id, gateway: gwName, lastErrorCode: null, note: `gateway:${outcome.gatewayStatus}` };
          action = "refund.processed"; break;
        case "REJECTED":
          data = { status: "FAILED", lastErrorCode: outcome.code, gateway: gwName }; action = "refund.rejected"; break;
        case "UNSUPPORTED":
          data = { status: "MANUAL", lastErrorCode: outcome.reason, gateway: gwName }; action = "refund.needs_manual"; break;
        default:
          data = { status: "REVIEW", lastErrorCode: outcome.code, gateway: gwName }; action = "refund.needs_review";
      }
      // تأیید «یک‌بارمصرف» است: هر نتیجه‌ای (حتی رد/نامعلوم) آن را مصرف می‌کند؛ تلاش بعدی تأیید تازه می‌خواهد
      if (dual) data = { ...data, approvalState: "NONE", approvalAction: null, approvalRef: null };
      const upd = await tx.refund.updateMany({ where: { id, status: "PROCESSING" }, data: data as never });
      if (upd.count !== 1) throw new ConflictException({ error: "refund_state_changed" });
      await this.audit.logIn(tx, { actorId: admin.id, actorRole: "ADMIN", action, objectType: "refund", objectId: id, meta: { amountRial: claimed.amountRial.toString(), gateway: att?.gateway ?? null, code: (data.lastErrorCode as string | null) ?? null } });
      // اعلان به بیمار با Outbox: «در همان تراکنشِ» ثبت نتیجه؛ مرگ پروسه بعد از commit اعلان را گم نمی‌کند
      if (outcome.kind === "ACCEPTED") await this.enqueueProcessed(tx, claimed.payment.appointmentId, id);
      return tx.refund.findUnique({ where: { id }, select: SELECT });
    });

    refundExec.inc({ outcome: outcome.kind === "AMBIGUOUS" ? "review" : outcome.kind.toLowerCase() });
    return toView(final as Row, this.approval);
  }

  /** ادمین استرداد را «بیرون از سامانه» (پنل درگاه/بانک) انجام داده و مرجع را ثبت می‌کند. */
  async markProcessed(admin: AuthUser, id: string, input: { reference: string; note?: string }, now: Date = new Date()): Promise<RefundView> {
    const facts = await this.readFacts(id);
    this.assertVerdict(canConsume(facts, "MARK_PROCESSED", input.reference, this.approval)); // فقط با «همان مرجعی» که Checker تأیید کرده
    const dual = requiresDualApproval(facts.amountRial, this.approval);
    const res = await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const upd = await tx.refund.updateMany({
        where: { id, status: { in: [...MARKABLE] as never }, ...(dual ? { approvalState: "APPROVED" as never, approvalAction: "MARK_PROCESSED" as never, approvalRef: input.reference } : {}) },
        data: { status: "PROCESSED", externalRef: `manual:${input.reference}`, processedAt: now, processedBy: admin.id, note: input.note ?? null, lastErrorCode: null, ...(dual ? { approvalState: "NONE" as never, approvalAction: null, approvalRef: null } : {}) },
      });
      if (upd.count !== 1) return null;
      await this.audit.logIn(tx, { actorId: admin.id, actorRole: "ADMIN", action: "refund.marked_processed", objectType: "refund", objectId: id, meta: { reference: input.reference, ...(dual ? { makerId: facts.makerId, checkerId: facts.checkerId } : {}) } });
      const row = await tx.refund.findUnique({ where: { id }, select: { ...SELECT } });
      if (row) await this.enqueueProcessed(tx, (row as Row).payment.appointmentId, id);
      return row;
    });
    if (!res) return this.notFoundOrConflict(id);
    return toView(res as Row, this.approval);
  }

  /** فقط REVIEW: ادمین در پنل درگاه بررسی کرد و هیچ استردادی ثبت نشده ⇒ FAILED تا بتوان دوباره اجرا کرد. */
  async markNotRefunded(admin: AuthUser, id: string, input: { note: string }): Promise<RefundView> {
    const res = await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const upd = await tx.refund.updateMany({ where: { id, status: "REVIEW" }, data: { status: "FAILED", note: input.note, lastErrorCode: "verified_not_refunded" } });
      if (upd.count !== 1) return null;
      await this.audit.logIn(tx, { actorId: admin.id, actorRole: "ADMIN", action: "refund.review_not_refunded", objectType: "refund", objectId: id, meta: {} });
      return tx.refund.findUnique({ where: { id }, select: SELECT });
    });
    if (!res) return this.notFoundOrConflict(id);
    return toView(res as Row, this.approval);
  }

  // ───────────── تأیید دو نفره (Maker/Checker) ─────────────

  /** Maker: درخواست تأیید برای یک اقدام (EXECUTE یا MARK_PROCESSED با مرجع مشخص). */
  async requestApproval(admin: AuthUser, id: string, input: { action: ApprovalAction; reference?: string; note?: string }, now: Date = new Date()): Promise<RefundView> {
    const facts = await this.readFacts(id);
    this.assertVerdict(canRequest(facts, input.action, input.reference, this.approval));
    const statuses = input.action === "EXECUTE" ? EXECUTABLE : MARKABLE;
    const res = await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const upd = await tx.refund.updateMany({
        where: { id, status: { in: [...statuses] as never }, approvalState: { in: ["NONE", "REJECTED"] as never } },
        data: {
          approvalState: "REQUESTED" as never, approvalAction: input.action as never, approvalRef: input.action === "MARK_PROCESSED" ? input.reference ?? null : null,
          makerId: admin.id, makerNote: input.note ?? null, requestedAt: now, checkerId: null, checkerNote: null, decidedAt: null,
        },
      });
      if (upd.count !== 1) return null;
      await this.audit.logIn(tx, { actorId: admin.id, actorRole: "ADMIN", action: "refund.approval_requested", objectType: "refund", objectId: id, meta: { action: input.action, reference: input.reference ?? null } });
      return tx.refund.findUnique({ where: { id }, select: SELECT });
    });
    if (!res) return this.notFoundOrConflict(id);
    return toView(res as Row, this.approval);
  }

  /** Checker (ادمینی غیر از Maker): تأیید یا رد. */
  async decideApproval(admin: AuthUser, id: string, input: { decision: "APPROVE" | "REJECT"; note?: string }, now: Date = new Date()): Promise<RefundView> {
    const facts = await this.readFacts(id);
    this.assertVerdict(canDecide(facts, admin.id));
    const approve = input.decision === "APPROVE";
    const res = await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const upd = await tx.refund.updateMany({
        where: { id, approvalState: "REQUESTED" as never },
        data: { approvalState: (approve ? "APPROVED" : "REJECTED") as never, checkerId: admin.id, checkerNote: input.note ?? null, decidedAt: now },
      });
      if (upd.count !== 1) return null;
      await this.audit.logIn(tx, { actorId: admin.id, actorRole: "ADMIN", action: approve ? "refund.approval_approved" : "refund.approval_rejected", objectType: "refund", objectId: id, meta: { makerId: facts.makerId, action: facts.approvalAction } });
      return tx.refund.findUnique({ where: { id }, select: SELECT });
    });
    if (!res) return this.notFoundOrConflict(id);
    return toView(res as Row, this.approval);
  }

  private async readFacts(id: string): Promise<RefundApprovalFacts & { checkerId: string | null }> {
    const r = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.refund.findUnique({ where: { id }, select: { status: true, amountRial: true, approvalState: true, approvalAction: true, approvalRef: true, makerId: true, checkerId: true } }),
    );
    if (!r) throw new NotFoundException();
    return {
      status: r.status, amountRial: r.amountRial, approvalState: (r.approvalState ?? "NONE") as ApprovalState, approvalAction: (r.approvalAction ?? null) as ApprovalAction | null,
      approvalRef: r.approvalRef ?? null, makerId: r.makerId ?? null, checkerId: r.checkerId ?? null,
    };
  }

  private assertVerdict(v: Verdict): void {
    if (v.ok) return;
    const code: Denial = v.code;
    if (code === "self_approval_forbidden") throw new ForbiddenException({ error: code });
    if (code === "reference_required") throw new BadRequestException({ error: code });
    throw new ConflictException({ error: code });
  }

  private async notFoundOrConflict(id: string): Promise<never> {
    const r = await this.prisma.withContext({ role: "SYSTEM" }, (tx) => tx.refund.findUnique({ where: { id }, select: { status: true } }));
    if (!r) throw new NotFoundException();
    throw new ConflictException({ error: "refund_not_in_expected_state", message: "refund_not_in_expected_state", status: r.status });
  }

  private async enqueueProcessed(tx: { appointment: { findUnique(args: { where: { id: string }; select: { patientId: true } }): Promise<{ patientId: string } | null> } }, appointmentId: string, refundId: string): Promise<void> {
    const a = await tx.appointment.findUnique({ where: { id: appointmentId }, select: { patientId: true } });
    if (!a) return;
    await this.outbox.enqueue(tx, { type: "refund.processed", aggregateType: "refund", aggregateId: refundId, payload: { appointmentId, patientId: a.patientId } });
  }
}

