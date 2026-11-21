import { describe, expect, it } from "vitest";
import { isAckSuccess, readPayload, sendPayload, wsErrorMessage } from "./chat-contract";

describe("قرارداد چت سمت کلاینت", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  it("پیام متنی را با تنها فیلدهای لازم میسازد", () => {
    expect(sendPayload(id, "سلام")).toEqual({ conversationId: id, body: "سلام", kind: "TEXT" });
  });

  it("پیوستها را با objectKey میسازد", () => {
    expect(sendPayload(id, "", "FILE", { objectKey: "chat/a.pdf", attachmentBytes: 10 }).objectKey).toBe("chat/a.pdf");
  });

  it("read_messages بدون و با messageId", () => {
    expect(readPayload(id)).toEqual({ conversationId: id });
    expect(readPayload(id, "42")).toEqual({ conversationId: id, messageId: "42" });
  });

  it(" ack تنها زمانی موفق است که messageId داشته باشد", () => {
    expect(isAckSuccess({ ok: true, ack: { ok: true, messageId: "42" } })).toBe(true);
    expect(isAckSuccess({ ok: true, ack: { ok: true } })).toBe(false);
    expect(isAckSuccess({ ok: false, ack: { ok: true, messageId: "42" } })).toBe(false);
    expect(isAckSuccess({ ok: true, error: new Error("timeout") })).toBe(false);
  });

  it("پیام خطا فارسی و بدون محتوای پیام است", () => {
    expect(wsErrorMessage({ code: "forbidden" })).toContain("عضو");
    expect(wsErrorMessage({ code: "timeout" })).toContain("پاسخی");
    expect(wsErrorMessage(undefined)).toBe("ارسال پیام ناموفق بود.");
  });
});
