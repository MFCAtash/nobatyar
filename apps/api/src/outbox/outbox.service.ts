import { type DomainEvent, type EventType, validateEvent } from "./outbox-events";

/** حداقل شکل tx ی Prisma که لازم داریم (تست‌پذیر؛ Prisma.TransactionClient همین را دارد). */
export interface OutboxTx {
  outboxEvent: { create(args: { data: { type: string; aggregateType: string; aggregateId: string; payload: object } }): Promise<unknown> };
}

/** نویسنده‌ی Outbox: «حتماً» داخل همان تراکنشِ تغییر وضعیت صدا زده شود. */
export interface OutboxWriter {
  enqueue<T extends EventType>(tx: unknown, event: DomainEvent<T>): Promise<void>;
}

export class OutboxService implements OutboxWriter {
  async enqueue<T extends EventType>(tx: unknown, event: DomainEvent<T>): Promise<void> {
    validateEvent(event);
    await (tx as OutboxTx).outboxEvent.create({ data: { type: event.type, aggregateType: event.aggregateType, aggregateId: event.aggregateId, payload: event.payload } });
  }
}

/** نسخه‌ی حافظه‌ای برای تست‌ها؛ رویدادها را فقط جمع می‌کند. */
export class RecordingOutbox implements OutboxWriter {
  events: DomainEvent[] = [];
  async enqueue<T extends EventType>(_tx: unknown, event: DomainEvent<T>): Promise<void> {
    validateEvent(event);
    this.events.push(event as unknown as DomainEvent);
  }
  get types(): string[] { return this.events.map((e) => e.type); }
}

export const OUTBOX_WRITER = Symbol("OUTBOX_WRITER");
