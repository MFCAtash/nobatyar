/** هدر Idempotency-Key (باید با apps/api/src/idempotency/idempotency-policy.ts یکی باشد). */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";

/** کلید تصادفی ۱۲۸بیتی؛ حروف/عدد/‑ (۳۶ نویسه) ⇒ در بازه‌ی ۱۶–۱۲۸ ی سرور. */
export function newIdempotencyKey(): string {
  const c = typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
}

export const idempotencyHeaders = (key: string): Record<string, string> => ({ [IDEMPOTENCY_HEADER]: key });

/**
 * کلیدِ «یک قصد»: برای هر قصد (مثلاً «اجرای استرداد X») یک کلید ساخته می‌شود و تا «موفقیت» همان می‌ماند؛
 * پس کلیک دوباره/تلاش مجدد پس از قطعی شبکه همان پاسخ را می‌گیرد و پول دوبار جابه‌جا نمی‌شود. بعد از موفقیت کلید آزاد می‌شود.
 */
export class IntentKeys {
  private keys = new Map<string, string>();
  get(intent: string): string { let k = this.keys.get(intent); if (!k) { k = newIdempotencyKey(); this.keys.set(intent, k); } return k; }
  done(intent: string): void { this.keys.delete(intent); }
  get size(): number { return this.keys.size; }
}
