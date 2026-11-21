import { describe, expect, it } from "vitest";
import { bodyAad, decryptBody, openBody, parseMessageCursor, previewOf, toMessageView, toSentView } from "./chat-codec";

/** crypto ساختگی: «رمزگذاری» = چسباندن AAD؛ رمزگشایی فقط با همان AAD موفق است (مثل GCM). */
const fake = { decrypt: (b: Uint8Array, aad: string) => { const s = Buffer.from(b).toString("utf-8"); const [a, ...rest] = s.split("|"); if (a !== aad) throw new Error("auth tag"); return Buffer.from(rest.join("|")); } };
const enc = (aad: string, text: string) => Buffer.from(`${aad}|${text}`);
const row = (o: Record<string, unknown> = {}) => ({ id: 7n, conversationId: "c1", senderId: "u1", kind: "TEXT", bodyEnc: enc(bodyAad(7n), "سلام"), attachmentName: null, attachmentMime: null, attachmentBytes: null, attachmentKey: null, readAt: null, editedAt: null, createdAt: new Date(0), ...o }) as Parameters<typeof toMessageView>[1];

describe("chat codec", () => {
  it("AAD has table:id:column shape (3 parts)", () => expect(bodyAad(7n)).toBe("messages:7:body"));
  it("decrypts with the current AAD and falls back to the legacy AAD (dev data)", () => {
    expect(openBody(fake, enc("messages:7:body", "جدید"), 7n).toString()).toBe("جدید");
    expect(openBody(fake, enc("msg:7:undefined", "قدیمی"), 7n).toString()).toBe("قدیمی");
    expect(() => openBody(fake, enc("messages:8:body", "x"), 7n)).toThrow(); // پیام دیگر (AAD ی شناسه‌ی دیگر)
  });
  it("a corrupt message degrades to empty text / ellipsis instead of failing the page", () => {
    const bad = row({ bodyEnc: Buffer.from("garbage") });
    expect(decryptBody(fake, bad)).toBe("");
    expect(previewOf(fake, bad)).toBe("…");
  });
  it("preview: text is cut to 60 chars, attachments show the file name", () => {
    expect(previewOf(fake, row({ bodyEnc: enc(bodyAad(7n), "ا".repeat(100)) })).length).toBe(60);
    expect(previewOf(fake, row({ kind: "FILE", attachmentName: "cbc.pdf", bodyEnc: Buffer.alloc(0) }))).toBe("📎 cbc.pdf");
    expect(previewOf(fake, undefined)).toBe("");
  });
  it("views stringify the bigint id and flag attachments", () => {
    const v = toMessageView(fake, row({ attachmentKey: "k" }));
    expect(v).toMatchObject({ id: "7", body: "سلام", hasAttachment: true });
    expect(toSentView({ id: 9n, conversationId: "c", senderId: "u", kind: "TEXT", attachmentName: null, attachmentMime: null, attachmentBytes: null, attachmentKey: null, createdAt: new Date(0) }, "hi")).toMatchObject({ id: "9", body: "hi", hasAttachment: false });
  });
  it("cursor accepts only 1–18 digit numbers", () => {
    expect(parseMessageCursor("123")).toBe(123n);
    for (const bad of ["", "12a", "-1", "1".repeat(19), "1e3"]) expect(parseMessageCursor(bad)).toBeNull();
  });
});
