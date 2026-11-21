import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import type { z } from "zod";
import { AuthUser, CurrentUser, Roles } from "../common/decorators";
import { Idempotent } from "../idempotency/idempotency.interceptor";
import { ZodPipe } from "../common/zod.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { RefundService } from "../payment/refund.service";
import { decideSchema, markSchema, notRefundedSchema, paymentListQuery, refundListQuery, rejectSchema, requestApprovalSchema } from "./finance.schemas";

/**
 * پنل مالی ادمین. فقط داده‌ی مالی/عملیاتی؛ هیچ داده‌ی سلامت (دلیل مراجعه، پرونده، …) انتخاب نمی‌شود،
 * پس با نقش SYSTEM و select صریح اجرا می‌شود (نه break-glass). هر «اقدام» در Audit ثبت می‌شود.
 */
@Roles("ADMIN")
@Controller("admin")
export class FinanceController {
  constructor(
    @Inject(RefundService) private readonly refunds: RefundService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Get("refunds")
  listRefunds(@Query(new ZodPipe(refundListQuery)) q: z.infer<typeof refundListQuery>) {
    return this.refunds.list(q.status, q.limit);
  }

  @Post("refunds/:id/execute")
  @HttpCode(200)
  @Idempotent()
  execute(@CurrentUser() a: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.refunds.execute(a, id);
  }

  @Post("refunds/:id/mark-processed")
  @HttpCode(200)
  @Idempotent()
  markProcessed(@CurrentUser() a: AuthUser, @Param("id", new ParseUUIDPipe()) id: string, @Body(new ZodPipe(markSchema)) body: z.infer<typeof markSchema>) {
    return this.refunds.markProcessed(a, id, body);
  }

  @Post("refunds/:id/mark-not-refunded")
  @HttpCode(200)
  @Idempotent()
  markNotRefunded(@CurrentUser() a: AuthUser, @Param("id", new ParseUUIDPipe()) id: string, @Body(new ZodPipe(notRefundedSchema)) body: z.infer<typeof notRefundedSchema>) {
    return this.refunds.markNotRefunded(a, id, body);
  }

  /** Maker: درخواست تأیید دو نفره برای یک اقدام روی استرداد. */
  @Post("refunds/:id/request-approval")
  @HttpCode(200)
  @Idempotent()
  requestApproval(@CurrentUser() a: AuthUser, @Param("id", new ParseUUIDPipe()) id: string, @Body(new ZodPipe(requestApprovalSchema)) body: z.infer<typeof requestApprovalSchema>) {
    return this.refunds.requestApproval(a, id, body);
  }

  /** Checker (ادمینی غیر از Maker): تأیید. */
  @Post("refunds/:id/approval/approve")
  @HttpCode(200)
  @Idempotent()
  approveApproval(@CurrentUser() a: AuthUser, @Param("id", new ParseUUIDPipe()) id: string, @Body(new ZodPipe(decideSchema)) body: z.infer<typeof decideSchema>) {
    return this.refunds.decideApproval(a, id, { decision: "APPROVE", note: body.note });
  }

  @Post("refunds/:id/approval/reject")
  @HttpCode(200)
  @Idempotent()
  rejectApproval(@CurrentUser() a: AuthUser, @Param("id", new ParseUUIDPipe()) id: string, @Body(new ZodPipe(rejectSchema)) body: z.infer<typeof rejectSchema>) {
    return this.refunds.decideApproval(a, id, { decision: "REJECT", note: body.note });
  }

  @Get("payments")
  async listPayments(@Query(new ZodPipe(paymentListQuery)) q: z.infer<typeof paymentListQuery>) {
    const staleBefore = new Date(Date.now() - 30 * 60_000);
    const where = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.attention ? { OR: [{ status: "PAID", appointmentSyncedAt: null }, { status: "INITIATED", createdAt: { lt: staleBefore } }] } : {}),
    };
    const rows = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.payment.findMany({
        where: where as never, orderBy: { createdAt: "desc" }, take: q.limit,
        select: {
          id: true, status: true, amountRial: true, gateway: true, paidAt: true, createdAt: true, appointmentSyncedAt: true, appointmentId: true,
          appointment: { select: { status: true } },
          attempts: { orderBy: { createdAt: "asc" }, select: { gateway: true, status: true, failureCode: true, createdAt: true } },
          refunds: { select: { status: true, amountRial: true } },
        },
      }),
    );
    return rows.map((p) => ({
      id: p.id, status: p.status, amountRial: p.amountRial.toString(), gateway: p.gateway, paidAt: p.paidAt, createdAt: p.createdAt,
      synced: !!p.appointmentSyncedAt, appointmentId: p.appointmentId, appointmentStatus: p.appointment.status,
      attempts: p.attempts, refunds: p.refunds.map((r) => ({ status: r.status, amountRial: r.amountRial.toString() })),
    }));
  }

  /** خلاصه‌ی عملیاتی برای صفحه‌ی اول پنل: صف استرداد و پرداخت‌های نیازمند توجه. */
  @Get("finance/summary")
  async summary() {
    const staleBefore = new Date(Date.now() - 30 * 60_000);
    const since = new Date(Date.now() - 24 * 3600_000);
    return this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const [refundGroups, paidUnsynced, staleInitiated, paid24h, mismatch] = await Promise.all([
        tx.refund.groupBy({ by: ["status"], _count: { _all: true }, _sum: { amountRial: true } }),
        tx.payment.count({ where: { status: "PAID", appointmentSyncedAt: null } }),
        tx.payment.count({ where: { status: "INITIATED", createdAt: { lt: staleBefore } } }),
        tx.payment.aggregate({ where: { status: "PAID", paidAt: { gte: since } }, _count: { _all: true }, _sum: { amountRial: true } }),
        tx.paymentAttempt.count({ where: { status: "MISMATCH" } }),
      ]);
      return {
        refunds: Object.fromEntries(refundGroups.map((g) => [g.status, { count: g._count._all, amountRial: (g._sum.amountRial ?? 0n).toString() }])),
        attention: { paidUnsynced, staleInitiated, mismatchAttempts: mismatch },
        paidLast24h: { count: paid24h._count._all, amountRial: (paid24h._sum.amountRial ?? 0n).toString() },
      };
    });
  }
}
