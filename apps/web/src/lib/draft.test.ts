import { describe, expect, it } from "vitest";
import { clearAllDrafts, clearDraft, DRAFT_TTL_MS, loadDraft, saveDraft, type StorageLike } from "./draft";

function mem(): StorageLike {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); },
    key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; },
  };
}

describe("draft storage", () => {
  it("round-trips data", () => {
    const s = mem();
    saveDraft(s, "book:1", { reason: "سردرد", kind: "VIDEO" }, 1000);
    expect(loadDraft(s, "book:1", 2000)).toEqual({ reason: "سردرد", kind: "VIDEO" });
  });
  it("expires after TTL and removes the entry", () => {
    const s = mem();
    saveDraft(s, "k", { a: 1 }, 0);
    expect(loadDraft(s, "k", DRAFT_TTL_MS + 1)).toBeNull();
    expect(s.length).toBe(0);
  });
  it("rejects corrupted / wrong-version payloads", () => {
    const s = mem();
    s.setItem("nvy-draft:x", "{oops");
    expect(loadDraft(s, "x")).toBeNull();
    s.setItem("nvy-draft:y", JSON.stringify({ v: 99, at: Date.now(), data: 1 }));
    expect(loadDraft(s, "y")).toBeNull();
  });
  it("clearAllDrafts only removes draft keys", () => {
    const s = mem();
    s.setItem("nvy-theme", "dark");
    saveDraft(s, "a", 1); saveDraft(s, "b", 2);
    clearAllDrafts(s);
    expect(s.getItem("nvy-theme")).toBe("dark");
    expect(loadDraft(s, "a")).toBeNull();
    clearDraft(s, "a");
  });
  it("is a no-op without storage", () => {
    saveDraft(null, "a", 1);
    expect(loadDraft(null, "a")).toBeNull();
  });
});
