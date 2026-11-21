import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { AuthUser } from "../common/decorators";
import { PrismaService } from "../prisma/prisma.service";

interface DailyStatRow {
  day: Date | string;
  visits: bigint;
  no_shows: bigint;
  cancellations: bigint;
  revenue_rial: bigint;
}

/**
 * A24: Read Model سبک (CQRS) — خواندن از view دیتابیس بهجای query های سنگین تراکنشی.
 * view با security_invoker ساخته شده تا RLS جداول پایه اعمال شود.
 */
@Injectable()
export class ReadModelService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private assertDoctor(u: AuthUser) {
    if (u.role !== "DOCTOR") throw new ForbiddenException({ error: "doctor_only" });
  }

  async daily(u: AuthUser, days = 30) {
    this.assertDoctor(u);
    const n = Math.min(Math.max(days, 1), 90);
    const rows = await this.prisma.withContext({ role: u.role, userId: u.id }, (tx) =>
      tx.$queryRaw<DailyStatRow[]>`
        SELECT day, visits, no_shows, cancellations, revenue_rial
        FROM v_doctor_daily_stats
        WHERE doctor_id = ${u.id}::uuid AND day >= (CURRENT_DATE - ${n}::int)
        ORDER BY day DESC`,
    );
    return {
      days: n,
      items: rows.map((r) => ({
        day: typeof r.day === "string" ? r.day.slice(0, 10) : r.day.toISOString().slice(0, 10),
        visits: Number(r.visits),
        noShows: Number(r.no_shows),
        cancellations: Number(r.cancellations),
        revenueRial: r.revenue_rial.toString(),
      })),
    };
  }

  async summary(u: AuthUser, days = 30) {
    const { items, days: n } = await this.daily(u, days);
    const total = items.reduce(
      (acc, r) => ({
        visits: acc.visits + r.visits,
        noShows: acc.noShows + r.noShows,
        cancellations: acc.cancellations + r.cancellations,
        revenueRial: acc.revenueRial + BigInt(r.revenueRial),
      }),
      { visits: 0, noShows: 0, cancellations: 0, revenueRial: 0n },
    );
    return {
      days: n,
      ...total,
      revenueRial: total.revenueRial.toString(),
      noShowRate: total.visits + total.noShows > 0
        ? Math.round((total.noShows / (total.visits + total.noShows)) * 1000) / 10
        : 0,
    };
  }
}
