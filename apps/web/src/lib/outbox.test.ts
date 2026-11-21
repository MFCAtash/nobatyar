import { describe, expect, it } from "vitest";
import { enqueue, OUTBOX_MAX, OUTBOX_MAX_AGE_MS, remove, splitFresh } from "./outbox";

describe("chat outbox", () => {
  it("trims, rejects empty and caps the queue", () => {
    expect(enqueue([], "   ").ok).toBe(false);
    const r = enqueue([], "  سلام ", 1, () => "a");
    expect(r.ok && r.queue).toEqual([{ localId: "a", body: "سلام", at: 1 }]);
    let q = [] as ReturnType<typeof enqueue>["queue"];
    for (let i = 0; i < OUTBOX_MAX; i++) { const x = enqueue(q, "m", i, () => String(i)); q = x.queue; }
    const full = enqueue(q, "x");
    expect(full.ok).toBe(false);
    expect(!full.ok && full.reason).toBe("full");
  });
  it("splits stale messages and removes by id", () => {
    const q = [{ localId: "old", body: "a", at: 0 }, { localId: "new", body: "b", at: OUTBOX_MAX_AGE_MS }];
    const { fresh, stale } = splitFresh(q, OUTBOX_MAX_AGE_MS + 1);
    expect(fresh.map((p) => p.localId)).toEqual(["new"]);
    expect(stale.map((p) => p.localId)).toEqual(["old"]);
    expect(remove(q, "old")).toHaveLength(1);
  });
});
