import { Inject, Injectable } from "@nestjs/common";
import type { IdempotencyStore } from "./idempotency-store";
import { IDEMPOTENCY_STORE } from "./idempotency.tokens";

/** حذف کلیدهای منقضی (فراخوان: scheduler). */
@Injectable()
export class IdempotencyPurger {
  constructor(@Inject(IDEMPOTENCY_STORE) private readonly store: IdempotencyStore) {}
  purgeExpired(now: Date): Promise<number> { return this.store.purgeExpired(now); }
}
