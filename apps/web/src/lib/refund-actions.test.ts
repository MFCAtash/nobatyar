import { describe, expect, it } from "vitest";
import { refundActions } from "./refund-actions";
import type { RefundApproval, RefundItem } from "./types";

const ap = (o: Partial<RefundApproval> = {}): RefundApproval => ({ required: true, state: "NONE", action: null, reference: null, makerId: null, makerNote: null, requestedAt: null, checkerId: null, checkerNote: null, decidedAt: null, ...o });
const r = (status: RefundItem["status"], approval: RefundApproval) => ({ status, approval });

describe("refundActions", () => {
  it("بدون تأیید دو نفره (مبلغ کم/غیرفعال): اجرای مستقیم", () => {
    expect(refundActions(r("PENDING", ap({ required: false })), "A")).toMatchObject({ canExecute: true, canMarkProcessed: true, canRequestExecute: false });
  });
  it("وضعیت NONE: فقط درخواست تأیید؛ اجرا بسته است", () => {
    expect(refundActions(r("PENDING", ap()), "A")).toMatchObject({ canRequestExecute: true, canRequestMark: true, canExecute: false, canDecide: false });
  });
  it("Maker منتظر Checker است و نمی‌تواند تأیید کند؛ ادمین دیگر می‌تواند", () => {
    const req = ap({ state: "REQUESTED", action: "EXECUTE", makerId: "A" });
    expect(refundActions(r("PENDING", req), "A")).toMatchObject({ canDecide: false, waiting: "checker" });
    expect(refundActions(r("PENDING", req), "B")).toMatchObject({ canDecide: true, waiting: "you-are-checker" });
  });
  it("پس از تأیید فقط همان اقدام فعال است", () => {
    expect(refundActions(r("PENDING", ap({ state: "APPROVED", action: "EXECUTE", makerId: "A", checkerId: "B" })), "A")).toMatchObject({ canExecute: true, canMarkProcessed: false });
    expect(refundActions(r("REVIEW", ap({ state: "APPROVED", action: "MARK_PROCESSED", makerId: "A", checkerId: "B" })), "A")).toMatchObject({ canExecute: false, canMarkProcessed: true });
  });
  it("رد شده ⇒ دوباره قابل درخواست؛ REVIEW اجرا ندارد؛ PROCESSED هیچ اقدامی ندارد", () => {
    expect(refundActions(r("FAILED", ap({ state: "REJECTED", makerId: "A" })), "A")).toMatchObject({ canRequestExecute: true, waiting: "rejected" });
    expect(refundActions(r("REVIEW", ap()), "A")).toMatchObject({ canRequestExecute: false, canRequestMark: true });
    expect(refundActions(r("PROCESSED", ap()), "A")).toMatchObject({ canRequestExecute: false, canExecute: false, canMarkProcessed: false });
  });
});
