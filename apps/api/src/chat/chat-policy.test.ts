import { describe, expect, it } from "vitest";
import { ALLOWED_MIME, MAX_FILE_BYTES } from "../storage/storage.service";
import { isOwnChatObjectKey, verifyAttachment } from "./chat-policy";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const UP = "33333333-3333-4333-8333-333333333333";

describe("isOwnChatObjectKey", () => {
  it("کلید خودِ کاربر ✓", () => {
    expect(isOwnChatObjectKey(U1, `chat/${U1}/${UP}.pdf`)).toBe(true);
    expect(isOwnChatObjectKey(U1, `chat/${U1}/${UP}.docx`)).toBe(true);
  });
  it("کلید کاربر دیگر یا bucket دیگر ✗", () => {
    expect(isOwnChatObjectKey(U1, `chat/${U2}/${UP}.pdf`)).toBe(false);
    expect(isOwnChatObjectKey(U1, `records/${U1}/${UP}.pdf`)).toBe(false);
  });
  it("قالب نامعتبر / path traversal ✗", () => {
    expect(isOwnChatObjectKey(U1, `chat/${U1}/../${U2}/${UP}.pdf`)).toBe(false);
    expect(isOwnChatObjectKey(U1, `chat/${U1}/${UP}`)).toBe(false);
    expect(isOwnChatObjectKey(U1, `chat/${U1}/x.pdf`)).toBe(false);
    expect(isOwnChatObjectKey("not-a-uuid", `chat/not-a-uuid/${UP}.pdf`)).toBe(false);
  });
});

describe("verifyAttachment", () => {
  const ok = { size: 1000, mime: "application/pdf" };
  it("نوع/حجم واقعی مجاز و هم‌خوان ✓", () => {
    expect(verifyAttachment(ok, { mime: "application/pdf", bytes: 1000 }, ALLOWED_MIME.chat!, MAX_FILE_BYTES)).toEqual({ ok: true, value: { mime: "application/pdf", bytes: 1000 } });
    expect(verifyAttachment(ok, {}, ALLOWED_MIME.chat!, MAX_FILE_BYTES).ok).toBe(true); // ادعای کلاینت اختیاری نیست که دور زدن باشد: مقدار سرور ملاک است
  });
  it("mime غیرمجاز، خالی، بزرگ، ناهم‌خوان ✗", () => {
    expect(verifyAttachment({ size: 10, mime: "image/svg+xml" }, {}, ALLOWED_MIME.chat!, MAX_FILE_BYTES)).toEqual({ ok: false, error: "mime_not_allowed" });
    expect(verifyAttachment({ size: 0, mime: "application/pdf" }, {}, ALLOWED_MIME.chat!, MAX_FILE_BYTES)).toEqual({ ok: false, error: "empty" });
    expect(verifyAttachment({ size: MAX_FILE_BYTES + 1, mime: "application/pdf" }, {}, ALLOWED_MIME.chat!, MAX_FILE_BYTES)).toEqual({ ok: false, error: "too_large" });
    expect(verifyAttachment(ok, { mime: "image/png" }, ALLOWED_MIME.chat!, MAX_FILE_BYTES)).toEqual({ ok: false, error: "mime_mismatch" });
    expect(verifyAttachment(ok, { bytes: 5 }, ALLOWED_MIME.chat!, MAX_FILE_BYTES)).toEqual({ ok: false, error: "size_mismatch" });
  });
});
