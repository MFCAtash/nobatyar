import { describe, expect, it, vi } from "vitest";
import { RefundWorkerService, REFUND_WORKER_ACTOR_ID } from "./refund-worker.service";
import type { RefundWorkerConfig } from "./refund-worker.config";

const baseCfg: RefundWorkerConfig = { enabled: true, everyMs: 300_000, batch: 10, minAgeMin: 5, maxTry: 3 };
const now = new Date("2026-01-01T12:00:00Z");

function refund(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, status: "PENDING", createdAt: new Date(now.getTime() - 60_000).toISOString(),
    tryCount: 0, amountRial: "1000000", ...overrides,
  };
}

function world(rows: ReturnType<typeof refund>[], executeImpl: (actor: unknown, id: string) => Promise<{ status: string }>) {
  const sweepStale = vi.fn().mockResolvedValue(0);
  const list = vi.fn().mockResolvedValue(rows);
  const execute = vi.fn(executeImpl);
  const svc = new RefundWorkerService({ sweepStale, list, execute } as never, baseCfg);
  return { svc, sweepStale, list, execute };
}

describe("refund worker", () => {
  it("--flag خاموش ⇒ هیچ تماسی با سرویس استرداد نمیشود", async () => {
    const { sweepStale, list, execute } = world([refund("a")], async () => ({ status: "PROCESSED" }));
    const svc = new RefundWorkerService({ sweepStale, list, execute } as never, { ...baseCfg, enabled: false });
    expect(await svc.run(now)).toMatchObject({ enabled: false, attempted: 0, processed: 0 });
    expect(sweepStale).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("فقط refundهای بالغ و کمتلاش را اجرا میکند", async () => {
    const { svc, list, execute } = world([
      refund("fresh", { createdAt: new Date(now.getTime() - 60_000).toISOString() }),
      refund("stale", { createdAt: new Date(now.getTime() - 10 * 60_000).toISOString() }),
      refund("tired", { createdAt: new Date(now.getTime() - 10 * 60_000).toISOString(), tryCount: 3 }),
    ], async (_actor, id) => ({ status: id === "stale" ? "PROCESSED" : "FAILED" }));

    const r = await svc.run(now);
    expect(r).toMatchObject({ enabled: true, swept: 0, attempted: 1, processed: 1, failed: 0 });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0]).toMatchObject({ id: REFUND_WORKER_ACTOR_ID, role: "ADMIN" });
    expect(list).toHaveBeenCalledWith("PENDING", 10, now);
  });

  it("خطای درگاه worker را متوقف نمیکند و نمیتواند چهارچشمی را دور بزند", async () => {
    const { svc, execute } = world([refund("a", { createdAt: new Date(now.getTime() - 10 * 60_000).toISOString() })], async () => { throw new Error("conflict"); });
    const r = await svc.run(now);
    expect(r.failed).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
