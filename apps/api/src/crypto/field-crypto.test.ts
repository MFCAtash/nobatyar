import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { aad, FieldCrypto } from "./field-crypto";
import { normalizeIranMobile } from "./phone";

const b64 = () => randomBytes(32).toString("base64");
const make = (keys: string, active: number, blind = b64()) =>
  new FieldCrypto({ keys, activeKeyId: active, blindIndexKey: blind });

describe("FieldCrypto", () => {
  const k1 = b64();
  const k2 = b64();
  const blind = b64();

  it("round-trips strings and buffers (unicode safe)", () => {
    const c = make(`1:${k1}`, 1, blind);
    const a = aad("appointments", "id-1", "reason");
    expect(c.decryptString(c.encrypt("سردرد شدید از دیروز", a), a)).toBe("سردرد شدید از دیروز");
    expect(c.decrypt(c.encrypt(Buffer.from([1, 2, 3]), a), a)).toEqual(Buffer.from([1, 2, 3]));
  });

  it("uses a fresh IV each time", () => {
    const c = make(`1:${k1}`, 1, blind);
    const a = aad("t", "1", "c");
    expect(c.encrypt("x", a).equals(c.encrypt("x", a))).toBe(false);
  });

  it("rejects tampered ciphertext", () => {
    const c = make(`1:${k1}`, 1, blind);
    const a = aad("t", "1", "c");
    const blob = c.encrypt("secret", a);
    blob[blob.length - 1] ^= 0xff;
    expect(() => c.decrypt(blob, a)).toThrow("decryption failed");
  });

  it("binds ciphertext to its AAD (row swap detection)", () => {
    const c = make(`1:${k1}`, 1, blind);
    const blob = c.encrypt("secret", aad("health_records", "A", "content"));
    expect(() => c.decrypt(blob, aad("health_records", "B", "content"))).toThrow("decryption failed");
  });

  it("supports key rotation: old blobs decrypt, rotate() re-encrypts with active key", () => {
    const a = aad("t", "1", "c");
    const old = make(`1:${k1}`, 1, blind).encrypt("v", a);
    const c = make(`1:${k1},2:${k2}`, 2, blind);
    expect(c.needsRotation(old)).toBe(true);
    expect(c.decryptString(old, a)).toBe("v");
    const rotated = c.rotate(old, a);
    expect(c.needsRotation(rotated)).toBe(false);
    expect(c.decryptString(rotated, a)).toBe("v");
    expect(() => make(`1:${k1}`, 1, blind).decrypt(rotated, a)).toThrow();
  });

  it("blind index is deterministic, purpose-scoped and key-dependent", () => {
    const c = make(`1:${k1}`, 1, blind);
    expect(c.blindIndex("989121234567", "phone")).toBe(c.blindIndex("989121234567", "phone"));
    expect(c.blindIndex("989121234567", "phone")).not.toBe(c.blindIndex("989121234567", "other"));
    expect(make(`1:${k1}`, 1, b64()).blindIndex("989121234567", "phone")).not.toBe(c.blindIndex("989121234567", "phone"));
  });

  it("validates configuration", () => {
    expect(() => make("1:AAAA", 1)).toThrow(/32 bytes/);
    expect(() => make(`1:${k1}`, 2)).toThrow(/not found/);
    expect(() => make(`1:${k1},1:${k2}`, 1)).toThrow(/duplicate/);
    expect(() => make(`1:${k1}`, 1, Buffer.alloc(8).toString("base64"))).toThrow(/BLIND_INDEX_KEY/);
  });
});

describe("normalizeIranMobile", () => {
  it.each([
    ["09121234567", "989121234567"],
    ["+98 912 123 4567", "989121234567"],
    ["00989121234567", "989121234567"],
    ["9121234567", "989121234567"],
    ["۰۹۱۲۱۲۳۴۵۶۷", "989121234567"],
  ])("normalizes %s", (input, expected) => expect(normalizeIranMobile(input)).toBe(expected));

  it.each(["", "0912", "08121234567", "abc", "0912123456789"])("rejects %s", (input) =>
    expect(normalizeIranMobile(input)).toBeNull(),
  );
});
