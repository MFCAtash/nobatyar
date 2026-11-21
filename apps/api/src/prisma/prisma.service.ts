import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import type { Role } from "@nobatyar/shared";

/**
 * زمینه‌ی دسترسی هر تراکنش — توسط RLS در Postgres خوانده می‌شود.
 *  - role = 'SYSTEM' فقط برای فرایندهای بدون کاربر (ورود، job های زمان‌بندی‌شده).
 *  - role = 'ANON' برای مسیرهای عمومی (جستجوی پزشک/اسلات)؛ فقط به جداول با سیاست خواندن عمومی دسترسی دارد.
 */
export interface DbContext {
  role: Role | "SYSTEM" | "ANON";
  userId?: string;
  /** فقط با AuditService.withBreakGlass تنظیم شود. */
  breakGlass?: boolean;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // API با نقش غیرمالک و بدون BYPASSRLS وصل می‌شود؛ DATABASE_URL (مالک) فقط برای migrate است.
    super({ datasources: { db: { url: process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL } } });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * اجرای کد در یک تراکنش با زمینه‌ی RLS.
   * set_config(..., true) = محدود به همین تراکنش؛ در connection pool نشت نمی‌کند.
   * همه‌ی دسترسی‌های داده‌ی کاربر باید از این متد عبور کند (نه مستقیم از this.user و ...).
   */
  withContext<T>(ctx: DbContext, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    if (ctx.role !== "SYSTEM" && ctx.role !== "ANON" && !ctx.userId) throw new Error("userId is required for non-SYSTEM context");
    return this.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT
          set_config('app.user_id', ${ctx.userId ?? ""}, true),
          set_config('app.role', ${ctx.role}, true),
          set_config('app.break_glass', ${ctx.breakGlass ? "on" : "off"}, true)`;
        return fn(tx);
      },
      { timeout: 10_000, maxWait: 5_000 },
    );
  }
}
