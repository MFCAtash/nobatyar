import { describe, expect, it } from "vitest";
import { IntentKeys, idempotencyHeaders, newIdempotencyKey } from "./idempotency";

describe("idempotency keys", () => {
  it("are 36 chars, unique and within the server's 16–128 / charset rules", () => {
    const a = newIdempotencyKey(), b = newIdempotencyKey();
    expect(a).toMatch(/^[A-Za-z0-9._:-]{16,128}$/);
    expect(a).not.toBe(b);
  });
  it("the same intent keeps its key until done(); different intents differ", () => {
    const k = new IntentKeys();
    const first = k.get("refund:r1:execute");
    expect(k.get("refund:r1:execute")).toBe(first);
    expect(k.get("refund:r2:execute")).not.toBe(first);
    k.done("refund:r1:execute");
    expect(k.get("refund:r1:execute")).not.toBe(first);
  });
  it("header name", () => expect(idempotencyHeaders("x".repeat(20))).toEqual({ "Idempotency-Key": "x".repeat(20) }));
});
