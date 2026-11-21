import { isEventType, type EventType, type StoredEvent } from "./outbox-events";
import { BATCH_SIZE, truncateError } from "./outbox-policy";
import type { OutboxStore } from "./outbox-store";

export type Handler = (event: StoredEvent) => Promise<void>;
export type HandlerMap = Partial<Record<EventType, Handler>>;

export interface RelayResult { claimed: number; processed: number; retried: number; dead: number }

export interface RelayHooks {
  onProcessed?(type: string): void;
  onRetry?(type: string): void;
  onDead?(type: string, error: string): void;
  log?(level: "warn" | "error", msg: string): void;
}

/**
 * relay بدون وابستگی به Nest: یک دور = claim ⇒ اجرای handler ها ⇒ ثبت نتیجه.
 * - handler باید «ایدمپوتنت» باشد (تحویل حداقل-یک‌بار؛ مثلاً اعلان با id قطعی).
 * - نوع ناشناخته/بدون handler ⇒ شکست (در نهایت DEAD و هشدار)، نه نادیده‌گرفتن بی‌صدا.
 * - شکست یک رویداد، بقیه‌ی batch را متوقف نمی‌کند.
 */
export class OutboxRelay {
  constructor(private readonly store: OutboxStore, private readonly handlers: HandlerMap, private readonly hooks: RelayHooks = {}, private readonly now: () => Date = () => new Date()) {}

  async runOnce(limit: number = BATCH_SIZE): Promise<RelayResult> {
    const res: RelayResult = { claimed: 0, processed: 0, retried: 0, dead: 0 };
    const batch = await this.store.claim(this.now(), limit);
    res.claimed = batch.length;
    for (const ev of batch) {
      try {
        const h = isEventType(ev.type) ? this.handlers[ev.type] : undefined;
        if (!h) throw new Error(`no handler for event type "${ev.type}"`);
        await h(ev);
        await this.store.markProcessed(ev.id, this.now());
        res.processed++;
        this.hooks.onProcessed?.(ev.type);
      } catch (e) {
        const msg = truncateError(e);
        const verdict = await this.store.markFailed(ev.id, msg, ev.attempts, this.now());
        if (verdict === "dead") { res.dead++; this.hooks.onDead?.(ev.type, msg); this.hooks.log?.("error", `outbox event ${ev.id} (${ev.type}) is DEAD after ${ev.attempts} attempts: ${msg}`); }
        else { res.retried++; this.hooks.onRetry?.(ev.type); this.hooks.log?.("warn", `outbox event ${ev.id} (${ev.type}) failed (attempt ${ev.attempts}): ${msg}`); }
      }
    }
    return res;
  }
}
