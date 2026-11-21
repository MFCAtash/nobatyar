/**
 * پیش‌نویس فرم‌ها (مثلاً رزرو نوبت) — فقط sessionStorage (با بستن تب پاک می‌شود) + TTL.
 * ⚠️ حریم خصوصی: متن‌های بالینی روی دیسک دستگاه ماندگار نمی‌شوند؛ با خروج از حساب همه‌ی پیش‌نویس‌ها پاک می‌شود.
 */
export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  key(i: number): string | null;
  readonly length: number;
}

export const DRAFT_PREFIX = "nvy-draft:";
export const DRAFT_TTL_MS = 2 * 3_600_000;
const VERSION = 1;

interface Envelope<T> { v: number; at: number; data: T }

export function saveDraft<T>(storage: StorageLike | null, key: string, data: T, now: number = Date.now()): void {
  if (!storage) return;
  try { storage.setItem(DRAFT_PREFIX + key, JSON.stringify({ v: VERSION, at: now, data } satisfies Envelope<T>)); } catch { /* سهمیه/حالت خصوصی */ }
}

export function loadDraft<T>(storage: StorageLike | null, key: string, now: number = Date.now(), ttlMs: number = DRAFT_TTL_MS): T | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(DRAFT_PREFIX + key);
    if (!raw) return null;
    const e = JSON.parse(raw) as Partial<Envelope<T>> | null;
    if (!e || e.v !== VERSION || typeof e.at !== "number" || now - e.at > ttlMs || now < e.at - 60_000) {
      storage.removeItem(DRAFT_PREFIX + key);
      return null;
    }
    return e.data as T;
  } catch {
    try { storage.removeItem(DRAFT_PREFIX + key); } catch { /* ignore */ }
    return null;
  }
}

export function clearDraft(storage: StorageLike | null, key: string): void {
  try { storage?.removeItem(DRAFT_PREFIX + key); } catch { /* ignore */ }
}

/** خروج از حساب: همه‌ی پیش‌نویس‌ها پاک شود. */
export function clearAllDrafts(storage: StorageLike | null): void {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.startsWith(DRAFT_PREFIX)) keys.push(k); }
    keys.forEach((k) => storage.removeItem(k));
  } catch { /* ignore */ }
}

export function sessionDraftStorage(): StorageLike | null {
  try { return typeof window !== "undefined" ? window.sessionStorage : null; } catch { return null; }
}
