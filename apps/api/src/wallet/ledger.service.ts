import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { LedgerDirection, LedgerTxKind, Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../common/decorators";
import { aad, FIELD_CRYPTO, type FieldCrypto } from "../crypto";
import { PrismaService } from "../prisma/prisma.service";
import { validatePosting } from "./posting";

export interface PostingLine {
  accountId: string;
  direction: LedgerDirection;
  amountRial: bigint;
}

export interface PostingInput {
  kind: LedgerTxKind;
  idempotencyKey: string;
  description?: string;
  referenceType?: string;
  referenceId?: string;
  lines: PostingLine[];
}

/** حساب‌های سیستمی دفتر کل. */
export const SYSTEM_ACCOUNTS = {
  GATEWAY: "GATEWAY_CLEARING",
  REVENUE: "PLATFORM_REVENUE",
  PAYOUT: "PAYOUT_CLEARING",
  INSURANCE: "INSURANCE_CLEARING",
} as const;

const MAX_AMOUNT = 10_000_000_000n; // ۱ میلیارد تومان — محافظ ورودی

type Tx = Prisma.TransactionClient;

/**
 * A24: دفتر کل دوطرفه. هر تراکنش باید ΣDEBIT = ΣCREDIT باشد؛
 * موجودی کیف پول از روی entries به‌روزرسانی می‌شود (trigger دیتابیس).
 * نوشتن دفتر کل فقط در context سیستمی انجام می‌شود و مجوزدهی در سرویس است.
 */
@Injectable()
export class LedgerService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
  ) {}

  private assertAmount(amountRial: bigint) {
    if (amountRial <= 0n || amountRial > MAX_AMOUNT) throw new BadRequestException({ error: "invalid_amount" });
  }

  private systemAccount(tx: Tx, code: string) {
    return tx.walletAccount.upsert({ where: { code }, update: {}, create: { code, currency: "IRR" }, select: { id: true } });
  }

  private userAccount(tx: Tx, userId: string) {
    return tx.walletAccount.upsert({ where: { userId }, update: {}, create: { userId, currency: "IRR" }, select: { id: true } });
  }

  /** ثبت اتمیک یک تراکنش متوازن در همان تراکنش DB؛ idempotent بر اساس کلید. */
  private async postIn(tx: Tx, input: PostingInput) {
    const check = validatePosting(input);
    if (!check.ok) throw new BadRequestException({ error: check.error });
    for (const l of input.lines) if (l.amountRial > 10_000_000_000n) throw new BadRequestException({ error: "invalid_amount" });

    const existing = await tx.ledgerTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true } });
    if (existing) return { id: existing.id, replayed: true as const };

    const created = await tx.ledgerTransaction.create({
      data: {
        kind: input.kind,
        description: input.description,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        idempotencyKey: input.idempotencyKey,
        entries: { create: input.lines.map((l) => ({ accountId: l.accountId, direction: l.direction, amountRial: l.amountRial })) },
      },
      select: { id: true },
    });
    return { id: created.id, replayed: false as const };
  }

  async wallet(u: AuthUser) {
    return this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      const acc = await tx.walletAccount.findUnique({ where: { userId: u.id }, select: { balanceRial: true, currency: true } });
      return { balanceRial: (acc?.balanceRial ?? 0n).toString(), currency: acc?.currency ?? "IRR" };
    });
  }

  async history(u: AuthUser, take = 50) {
    return this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      const acc = await tx.walletAccount.findUnique({ where: { userId: u.id }, select: { id: true } });
      if (!acc) return { items: [] };
      const rows = await tx.ledgerEntry.findMany({
        where: { accountId: acc.id },
        orderBy: { id: "desc" },
        take: Math.min(Math.max(take, 1), 100),
        select: {
          id: true, direction: true, amountRial: true, createdAt: true,
          transaction: { select: { kind: true, description: true, referenceType: true, referenceId: true } },
        },
      });
      return {
        items: rows.map((r) => ({
          id: String(r.id), direction: r.direction, amountRial: r.amountRial.toString(),
          createdAt: r.createdAt, kind: r.transaction.kind, description: r.transaction.description,
          referenceType: r.transaction.referenceType, referenceId: r.transaction.referenceId,
        })),
      };
    });
  }

  /** شارژ کیف پول (sandbox). در production فقط پس از تأیید درگاه فراخوانی شود. */
  async topup(u: AuthUser, amountRial: bigint, idempotencyKey: string) {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_WALLET_TOPUP !== "true") {
      throw new ForbiddenException({ error: "topup_disabled" });
    }
    this.assertAmount(amountRial);
    return this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const wallet = await this.userAccount(tx, u.id);
      const gateway = await this.systemAccount(tx, SYSTEM_ACCOUNTS.GATEWAY);
      const result = await this.postIn(tx, {
        kind: "TOPUP", idempotencyKey, description: "شارژ کیف پول",
        referenceType: "wallet", referenceId: wallet.id,
        lines: [
          { accountId: gateway.id, direction: "DEBIT", amountRial },
          { accountId: wallet.id, direction: "CREDIT", amountRial },
        ],
      });
      await this.audit.logIn(tx, {
        actorId: u.id, actorRole: u.role, action: "wallet.topup", objectType: "wallet", objectId: wallet.id,
        meta: { amountRial: amountRial.toString(), txId: result.id, replayed: result.replayed },
      });
      return { transactionId: result.id, replayed: result.replayed };
    });
  }

  async requestPayout(u: AuthUser, amountRial: bigint, note?: string) {
    if (u.role !== "DOCTOR") throw new ForbiddenException({ error: "doctor_only" });
    this.assertAmount(amountRial);
    return this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const wallet = await tx.walletAccount.findUnique({ where: { userId: u.id }, select: { id: true, balanceRial: true } });
      if (!wallet || wallet.balanceRial < amountRial) throw new ConflictException({ error: "insufficient_funds" });
      const payout = await tx.payout.create({
        data: { doctorId: u.id, amountRial, note: note?.slice(0, 300) },
        select: { id: true, status: true, amountRial: true, requestedAt: true },
      });
      const clearing = await this.systemAccount(tx, SYSTEM_ACCOUNTS.PAYOUT);
      await this.postIn(tx, {
        kind: "PAYOUT", idempotencyKey: `payout:${payout.id}`, description: "درخواست تسویه پزشک",
        referenceType: "payout", referenceId: payout.id,
        lines: [
          { accountId: wallet.id, direction: "DEBIT", amountRial },
          { accountId: clearing.id, direction: "CREDIT", amountRial },
        ],
      });
      await this.audit.logIn(tx, {
        actorId: u.id, actorRole: u.role, action: "payout.requested", objectType: "payout", objectId: payout.id,
        meta: { amountRial: amountRial.toString() },
      });
      return { ...payout, amountRial: payout.amountRial.toString() };
    });
  }

  async listPayouts(u: AuthUser) {
    const where = u.role === "DOCTOR" ? { doctorId: u.id } : {};
    const rows = await this.prisma.withContext({ role: u.role, userId: u.id }, (tx) =>
      tx.payout.findMany({ where, orderBy: { requestedAt: "desc" }, take: 50 }),
    );
    return rows.map((r) => ({ ...r, amountRial: r.amountRial.toString() }));
  }

  async decidePayout(u: AuthUser, id: string, decision: "APPROVED" | "REJECTED" | "PAID") {
    if (u.role !== "ADMIN") throw new ForbiddenException({ error: "admin_only" });
    return this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const p = await tx.payout.findUnique({ where: { id }, select: { id: true, doctorId: true, amountRial: true, status: true } });
      if (!p) throw new NotFoundException();
      if (p.status === "PAID" || p.status === "REJECTED") throw new ConflictException({ error: "invalid_state", status: p.status });
      if (decision === "REJECTED") {
        const wallet = await this.userAccount(tx, p.doctorId);
        const clearing = await this.systemAccount(tx, SYSTEM_ACCOUNTS.PAYOUT);
        await this.postIn(tx, {
          kind: "PAYOUT", idempotencyKey: `payout-reject:${p.id}`, description: "برگشت تسویه رد‌شده",
          referenceType: "payout", referenceId: p.id,
          lines: [
            { accountId: clearing.id, direction: "DEBIT", amountRial: p.amountRial },
            { accountId: wallet.id, direction: "CREDIT", amountRial: p.amountRial },
          ],
        });
      }
      const updated = await tx.payout.update({
        where: { id },
        data: { status: decision, processedAt: decision === "PAID" || decision === "REJECTED" ? new Date() : null },
      });
      await this.audit.logIn(tx, {
        actorId: u.id, actorRole: u.role, action: `payout.${decision.toLowerCase()}`,
        objectType: "payout", objectId: id,
      });
      return { ...updated, amountRial: updated.amountRial.toString() };
    });
  }

  async addInsurance(u: AuthUser, input: { insurer: string; policyNumber?: string; coveragePercent: number; validUntil?: string }) {
    if (u.role !== "PATIENT") throw new ForbiddenException({ error: "patient_only" });
    const id = randomUUID();
    const enc = input.policyNumber ? this.crypto.encrypt(input.policyNumber, aad("insurance_policies", id, "policy_number")) : null;
    return this.prisma.withContext({ role: u.role, userId: u.id }, (tx) =>
      tx.insurancePolicy.create({
        data: {
          id, patientId: u.id, insurer: input.insurer.slice(0, 80), policyNumberEnc: enc,
          coveragePercent: input.coveragePercent, validUntil: input.validUntil ? new Date(input.validUntil) : null,
        },
        select: { id: true, insurer: true, coveragePercent: true, validUntil: true, createdAt: true },
      }),
    );
  }

  async listInsurance(u: AuthUser) {
    return this.prisma.withContext({ role: u.role, userId: u.id }, (tx) =>
      tx.insurancePolicy.findMany({
        where: { patientId: u.id },
        select: { id: true, insurer: true, coveragePercent: true, validUntil: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    );
  }

  async settleInsurance(u: AuthUser, input: { policyId: string; doctorId: string; amountRial: bigint; appointmentId?: string }) {
    if (u.role !== "ADMIN") throw new ForbiddenException({ error: "admin_only" });
    this.assertAmount(input.amountRial);
    return this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const policy = await tx.insurancePolicy.findUnique({ where: { id: input.policyId }, select: { id: true } });
      if (!policy) throw new NotFoundException({ error: "policy_not_found" });
      const wallet = await this.userAccount(tx, input.doctorId);
      const clearing = await this.systemAccount(tx, SYSTEM_ACCOUNTS.INSURANCE);
      const result = await this.postIn(tx, {
        kind: "INSURANCE_SETTLEMENT", idempotencyKey: `insurance:${policy.id}:${input.appointmentId ?? randomUUID()}`,
        description: "تسویه سهم بیمه با پزشک", referenceType: "insurance_policy", referenceId: policy.id,
        lines: [
          { accountId: clearing.id, direction: "DEBIT", amountRial: input.amountRial },
          { accountId: wallet.id, direction: "CREDIT", amountRial: input.amountRial },
        ],
      });
      await this.audit.logIn(tx, {
        actorId: u.id, actorRole: u.role, action: "insurance.settled", objectType: "insurance_policy", objectId: policy.id,
        meta: { doctorId: input.doctorId, amountRial: input.amountRial.toString() },
      });
      return { transactionId: result.id, replayed: result.replayed };
    });
  }
}
