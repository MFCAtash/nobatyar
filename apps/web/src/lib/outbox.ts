/**
 * صف ارسال پیام‌های چت هنگام قطعی (فقط در حافظه).
 * ⚠️ عمداً روی دیسک ذخیره نمی‌شود: سیاست PWA نوبت‌یار «هیچ داده‌ی پزشکی روی دستگاه نمی‌ماند» است (sw-policy.js).
 * با بستن تب، پیام‌های ارسال‌نشده از بین می‌روند؛ UI این را به کاربر می‌گوید.
 */
export interface Pending { localId: string; body: string; at: number }

export const OUTBOX_MAX = 20;
export const OUTBOX_MAX_AGE_MS = 15 * 60_000;

export type EnqueueResult = { ok: true; queue: Pending[] } | { ok: false; reason: "full" | "empty"; queue: Pending[] };

export function enqueue(queue: Pending[], body: string, now: number = Date.now(), id: () => string = () => `${now}-${Math.random().toString(36).slice(2, 8)}`): EnqueueResult {
  const t = body.trim();
  if (!t) return { ok: false, reason: "empty", queue };
  if (queue.length >= OUTBOX_MAX) return { ok: false, reason: "full", queue };
  return { ok: true, queue: [...queue, { localId: id(), body: t, at: now }] };
}

/** پیام‌های کهنه (بیش از ۱۵ دقیقه) دیگر خودکار فرستاده نمی‌شوند تا پیام قدیمی در زمان نامناسب نرسد. */
export function splitFresh(queue: Pending[], now: number = Date.now()): { fresh: Pending[]; stale: Pending[] } {
  const fresh: Pending[] = [], stale: Pending[] = [];
  for (const p of queue) (now - p.at <= OUTBOX_MAX_AGE_MS ? fresh : stale).push(p);
  return { fresh, stale };
}

export const remove = (queue: Pending[], localId: string): Pending[] => queue.filter((p) => p.localId !== localId);
