import type { GatewayName } from "./gateway";

interface State { failures: number; openedAt: number | null }

/**
 * قطع‌کننده‌ی مدار ساده، به‌ازای هر درگاه (در حافظه‌ی هر نمونه).
 *  - بعد از `threshold` شکست «پیاپی» مدار باز می‌شود و تا `cooldownMs` درگاه را کنار می‌گذاریم.
 *  - پس از cooldown یک «آزمایش» اجازه داده می‌شود (half-open): موفق ⇒ بسته؛ شکست ⇒ دوباره باز.
 * نمونه‌ها وضعیت را به‌اشتراک نمی‌گذارند؛ هر نمونه ظرف چند درخواست خودش خرابی را می‌فهمد و این عمداً ساده است.
 */
export class CircuitBreaker {
  private readonly s = new Map<GatewayName, State>();

  constructor(
    private readonly threshold: number,
    private readonly cooldownMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  private st(g: GatewayName): State {
    let v = this.s.get(g);
    if (!v) this.s.set(g, (v = { failures: 0, openedAt: null }));
    return v;
  }

  /** آیا مجاز به تلاش هستیم؟ (بسته، یا باز ولی cooldown گذشته ⇒ آزمایش) */
  canTry(g: GatewayName): boolean {
    const v = this.st(g);
    if (v.openedAt === null) return true;
    if (this.now() - v.openedAt >= this.cooldownMs) {
      // half-open: فقط یک آزمایش؛ تا نتیجه‌ی آن مدار «باز» حساب می‌شود
      v.openedAt = this.now();
      return true;
    }
    return false;
  }

  isOpen(g: GatewayName): boolean {
    const v = this.st(g);
    return v.openedAt !== null && this.now() - v.openedAt < this.cooldownMs;
  }

  success(g: GatewayName): void {
    const v = this.st(g);
    v.failures = 0;
    v.openedAt = null;
  }

  failure(g: GatewayName): void {
    const v = this.st(g);
    v.failures += 1;
    if (v.failures >= this.threshold) v.openedAt = this.now();
  }
}
