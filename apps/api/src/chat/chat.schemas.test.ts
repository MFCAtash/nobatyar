import { describe, expect, it } from "vitest";
import { JoinSchema, ReadSchema, SendMessageSchema, TypingSchema } from "./chat.schemas";

const id = "11111111-1111-4111-8111-111111111111";

describe("قرارداد رویدادهای چت", () => {
  it("پیام متنی با حداقل فیلدها معتبر است", () => {
    const p = SendMessageSchema.parse({ conversationId: id, body: "سلام", kind: "TEXT" });
    expect(p).toMatchObject({ conversationId: id, body: "سلام", kind: "TEXT" });
  });

  it("بدنه خالی و پیوست بدون متن مجاز است", () => {
    expect(() => SendMessageSchema.parse({ conversationId: id })).not.toThrow();
    expect(() => SendMessageSchema.parse({
      conversationId: id, kind: "FILE", objectKey: "chat/a.pdf", attachmentBytes: 12,
    })).not.toThrow();
  });

  it("پیامهای بیش از ۴۰۰۰ کاراکتر و حجم منفی رد میشوند", () => {
    expect(SendMessageSchema.safeParse({ conversationId: id, body: "x".repeat(4001) }).success).toBe(false);
    expect(SendMessageSchema.safeParse({ conversationId: id, attachmentBytes: -1 }).success).toBe(false);
  });

  it("read_messages بدون messageId کار میکند (باگ قدیمی)", () => {
    expect(ReadSchema.parse({ conversationId: id })).toEqual({ conversationId: id });
    expect(ReadSchema.parse({ conversationId: id, messageId: "42" }).messageId).toBe("42");
    expect(ReadSchema.safeParse({ conversationId: "bad" }).success).toBe(false);
  });

  it("join و typing فقط conversationId معتبر میپذیرند", () => {
    expect(JoinSchema.safeParse({ conversationId: id }).success).toBe(true);
    expect(JoinSchema.safeParse(id).success).toBe(false);
    expect(TypingSchema.safeParse({ conversationId: id, typing: true }).success).toBe(true);
  });
});
