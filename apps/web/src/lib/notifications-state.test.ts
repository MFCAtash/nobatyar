import { describe, expect, it } from "vitest";
import { applyLive, mergeFirstPage, parseNotification } from "./notifications-state";
import type { Notification, NotificationsState } from "./notifications-state";

const n = (id: string, at: string, readAt: string | null = null): Notification => ({
  id, kind: "SYSTEM", titleFa: "t", bodyFa: "b", readAt, createdAt: `2026-01-01T00:00:${at}.000Z`,
});
const st = (items: Notification[], unread: number, extra: Partial<NotificationsState> = {}): NotificationsState =>
  ({ items, unread, hasMore: false, cursor: null, loading: false, ...extra });

describe("parseNotification", () => {
  it("معتبر", () => {
    const v = parseNotification(JSON.stringify({ id: "a", kind: "PAYMENT_SUCCESS", titleFa: "x", bodyFa: "y", payload: { k: 1 }, readAt: null, createdAt: "2026-01-01T00:00:00.000Z" }));
    expect(v?.id).toBe("a");
    expect(v?.payload).toEqual({ k: 1 });
    expect(v?.readAt).toBeNull();
  });
  it("نامعتبر ⇒ null", () => {
    expect(parseNotification("{bad")).toBeNull();
    expect(parseNotification("null")).toBeNull();
    expect(parseNotification(JSON.stringify({ id: 1 }))).toBeNull();
  });
});

describe("applyLive", () => {
  it("اعلان جدید: بالای لیست و unread+1", () => {
    const s = applyLive(st([n("a", "01")], 1), n("b", "05"));
    expect(s.items.map((x) => x.id)).toEqual(["b", "a"]);
    expect(s.unread).toBe(2);
  });
  it("تکراری (بازپخش/تحویل دوباره): بدون تغییر", () => {
    const s0 = st([n("a", "01")], 1);
    expect(applyLive(s0, n("a", "01"))).toBe(s0);
  });
  it("اعلان قدیمی‌ترِ بازپخش‌شده در جای درست می‌نشیند", () => {
    const s = applyLive(st([n("c", "09")], 1), n("b", "05"));
    expect(s.items.map((x) => x.id)).toEqual(["c", "b"]);
  });
  it("اعلانِ از پیش خوانده‌شده شمارنده را زیاد نمی‌کند", () => {
    expect(applyLive(st([], 0), n("a", "01", "2026-01-01T00:00:02.000Z")).unread).toBe(0);
  });
});

describe("mergeFirstPage", () => {
  it("موارد SSE که هنوز در snapshot ی REST نیست حفظ و به unread اضافه می‌شود", () => {
    // REST پیش از رسیدن n5 گرفته شده؛ n5 زنده آمده
    const s = st([n("n5", "50"), n("n1", "10")], 1);
    const m = mergeFirstPage(s, { items: [n("n1", "10")], unread: 1, hasMore: false, cursor: null });
    expect(m.items.map((x) => x.id)).toEqual(["n5", "n1"]);
    expect(m.unread).toBe(2);
  });
  it("همپوشانی: هر دو مسیر یک اعلان را آورده‌اند ⇒ تکراری نمی‌شود و شمارنده دو برابر نمی‌شود", () => {
    const s = st([n("n2", "20")], 1);
    const m = mergeFirstPage(s, { items: [n("n2", "20"), n("n1", "10")], unread: 2, hasMore: false, cursor: null });
    expect(m.items.map((x) => x.id)).toEqual(["n2", "n1"]);
    expect(m.unread).toBe(2);
  });
  it("نسخه‌ی سرور (readAt) برای idهای مشترک برنده است", () => {
    const s = st([n("n1", "10")], 1);
    const m = mergeFirstPage(s, { items: [n("n1", "10", "2026-01-01T00:01:00.000Z")], unread: 0, hasMore: false, cursor: null });
    expect(m.items[0].readAt).not.toBeNull();
    expect(m.unread).toBe(0);
  });
  it("لیست خالی در سرور + اعلان زنده‌ی خوانده‌نشده", () => {
    const m = mergeFirstPage(st([n("n1", "10")], 1), { items: [], unread: 0, hasMore: false, cursor: null });
    expect(m.items).toHaveLength(1);
    expect(m.unread).toBe(1);
  });
  it("صفحات بعدیِ بارشده: cursor/hasMore ی فعلی حفظ می‌شود", () => {
    const s = st([n("n9", "90"), n("n1", "10")], 1, { hasMore: true, cursor: "CUR" });
    const m = mergeFirstPage(s, { items: [n("n9", "90")], unread: 1, hasMore: true, cursor: "FIRSTPAGE" });
    expect(m.cursor).toBe("CUR");
  });
  it("بدون صفحه‌ی عمیق: cursor ی سرور", () => {
    const m = mergeFirstPage(st([], 0), { items: [n("n1", "10")], unread: 1, hasMore: true, cursor: "C1" });
    expect(m.cursor).toBe("C1");
    expect(m.hasMore).toBe(true);
  });
});
