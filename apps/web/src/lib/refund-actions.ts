import type { RefundItem } from "./types";

/**
 * کدام دکمه‌ها برای ادمینِ جاری روی یک استرداد فعال‌اند (تأیید دو نفره).
 * UI فقط «راهنما» است؛ سرور (و CHECK ی DB) همین قواعد را اجبار می‌کنند.
 */
export interface RefundActionState {
  /** Maker: درخواست تأیید برای اجرا / ثبت دستی */
  canRequestExecute: boolean;
  canRequestMark: boolean;
  /** Checker */
  canDecide: boolean;
  /** اجرا (فقط پس از تأیید، یا اگر تأیید لازم نیست) */
  canExecute: boolean;
  canMarkProcessed: boolean;
  /** پیام وضعیت تأیید برای نمایش */
  waiting: null | "checker" | "you-are-checker" | "approved-execute" | "approved-mark" | "rejected";
}

const EXEC = ["PENDING", "FAILED", "MANUAL"];
const MARK = ["PENDING", "FAILED", "MANUAL", "REVIEW"];

export function refundActions(r: Pick<RefundItem, "status" | "approval">, meId: string | undefined): RefundActionState {
  const a = r.approval;
  const none: RefundActionState = { canRequestExecute: false, canRequestMark: false, canDecide: false, canExecute: false, canMarkProcessed: false, waiting: null };
  if (r.status === "PROCESSED" || r.status === "PROCESSING") return none;

  if (!a.required) {
    return { ...none, canExecute: EXEC.includes(r.status), canMarkProcessed: MARK.includes(r.status) };
  }
  const idle = a.state === "NONE" || a.state === "REJECTED";
  return {
    canRequestExecute: idle && EXEC.includes(r.status),
    canRequestMark: idle && MARK.includes(r.status),
    canDecide: a.state === "REQUESTED" && a.makerId !== null && a.makerId !== meId,
    canExecute: a.state === "APPROVED" && a.action === "EXECUTE" && EXEC.includes(r.status),
    canMarkProcessed: a.state === "APPROVED" && a.action === "MARK_PROCESSED" && MARK.includes(r.status),
    waiting: a.state === "REQUESTED" ? (a.makerId === meId ? "checker" : "you-are-checker")
      : a.state === "APPROVED" ? (a.action === "EXECUTE" ? "approved-execute" : "approved-mark")
      : a.state === "REJECTED" ? "rejected" : null,
  };
}
