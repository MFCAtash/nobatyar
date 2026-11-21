/** تطابق ورودی لیست انتظار با اسلات آزادشده — خالص و تستپذیر. */
export interface WaitlistCandidate {
  id: string;
  patientId: string;
  kind: string;
  desiredFrom: Date;
  desiredTo: Date;
}

export function matchesFreedSlot(w: WaitlistCandidate, slot: { startsAt: Date; endsAt: Date; kind: string }, now = new Date()): boolean {
  return w.kind === slot.kind
    && w.desiredFrom <= slot.startsAt
    && w.desiredTo >= slot.endsAt
    && w.desiredTo.getTime() > now.getTime();
}
