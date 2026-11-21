import { describe, expect, it } from "vitest";
import { formatComment, formatEvent, formatRetry, UUID_RE } from "./sse-format";

describe("sse-format", () => {
  it("فریم کامل: id، event و data (JSON) و خط خالی پایانی", () => {
    const s = formatEvent({ event: "notification", id: "abc", data: { a: 1 } });
    expect(s).toBe('id: abc\nevent: notification\ndata: {"a":1}\n\n');
  });

  it("داده‌ی چندخطی به چند خط data تقسیم می‌شود (تزریق فریم ممکن نیست)", () => {
    const s = formatEvent({ event: "x", data: "a\n\nevent: evil\r\nb" });
    expect(s).toBe("event: x\ndata: a\ndata: \ndata: event: evil\ndata: b\n\n");
    // هیچ خط خالیِ میانیِ فریم وجود ندارد: فقط یک فریم تولید می‌شود
    expect(s.split("\n\n").filter(Boolean)).toHaveLength(1);
  });

  it("JSON با کاراکتر newline داخل رشته: escape می‌شود", () => {
    const s = formatEvent({ data: { t: "x\ny" } });
    expect(s).toBe('data: {"t":"x\\ny"}\n\n');
  });

  it("id/event حاوی CR/LF/NUL رد می‌شود", () => {
    expect(() => formatEvent({ id: "a\nb", data: 1 })).toThrow();
    expect(() => formatEvent({ id: "a\0b", data: 1 })).toThrow();
    expect(() => formatEvent({ event: "e\r", data: 1 })).toThrow();
  });

  it("کامنت و retry", () => {
    expect(formatComment("hb")).toBe(": hb\n\n");
    expect(formatComment("a\nb")).toBe(": a b\n\n");
    expect(formatRetry(3000.9)).toBe("retry: 3000\n\n");
  });

  it("UUID_RE", () => {
    expect(UUID_RE.test("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(UUID_RE.test("not-a-uuid")).toBe(false);
    expect(UUID_RE.test("123e4567-e89b-12d3-a456-426614174000\n")).toBe(false);
  });
});
