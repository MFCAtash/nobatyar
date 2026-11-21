import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface AuditEntry {
  actorId?: string | null;
  actorRole?: string | null;
  action: string; // مثلاً "health_record.read"
  objectType: string;
  objectId?: string | null;
  /** فراداده‌ی غیرحساس. هرگز داده‌ی HEALTH/PERSONAL اینجا نگذارید. */
  meta?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** ثبت در همان تراکنش عملیات (اگر عملیات rollback شود، Audit هم نمی‌ماند؛ برای رویدادهای امنیتی از log() مستقل استفاده کنید). */
  async logIn(tx: Prisma.TransactionClient, e: AuditEntry): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorId: e.actorId ?? null,
        actorRole: e.actorRole ?? null,
        action: e.action,
        objectType: e.objectType,
        objectId: e.objectId ?? null,
        meta: e.meta ?? Prisma.JsonNull,
      },
    });
  }

  /** ثبت مستقل (تراکنش خودش). */
  async log(e: AuditEntry): Promise<void> {
    await this.prisma.withContext({ role: "SYSTEM" }, (tx) => this.logIn(tx, e));
  }

  /**
   * دسترسی اضطراری ادمین به داده‌ی HEALTH: دلیل اجباری، Audit پیش از دسترسی (در تراکنش جدا) و
   * سپس اجرا با app.break_glass=on. اگر ثبت Audit شکست بخورد، دسترسی داده نمی‌شود.
   */
  async withBreakGlass<T>(
    admin: { userId: string },
    reason: string,
    target: { objectType: string; objectId?: string },
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (reason.trim().length < 10) throw new ForbiddenException("break-glass reason is required (min 10 chars)");
    await this.log({
      actorId: admin.userId,
      actorRole: "ADMIN",
      action: "break_glass.access",
      objectType: target.objectType,
      objectId: target.objectId ?? null,
      meta: { reason },
    });
    return this.prisma.withContext({ role: "ADMIN", userId: admin.userId, breakGlass: true }, fn);
  }
}
