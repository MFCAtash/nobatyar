import { EXECUTABLE_STATUSES, MARKABLE_STATUSES } from "./refund-statuses";

/**
 * تأیید دو نفره (Maker/Checker) برای استرداد وجه — منطق خالص.
 *  - Maker (ادمین الف) «درخواست اقدام» می‌دهد؛ Checker (ادمین ب، «غیر از الف») تأیید/رد می‌کند؛ سپس اقدام اجرا می‌شود.
 *  - تأیید «یک‌بارمصرف» و برای «یک اقدام مشخص» است (EXECUTE = ارسال به درگاه، MARK_PROCESSED = ثبت انجام دستی با «همان مرجع»).
 *    بعد از هر اجرا (حتی ناموفق) تأیید مصرف می‌شود و تلاش بعدی تأیید تازه می‌خواهد.
 *  - غیر از این منطق، DB هم «checker ≠ maker» را با CHECK اجبار می‌کند (phase17-backend.sql).
 */
export type ApprovalState = "NONE" | "REQUESTED" | "APPROVED" | "REJECTED";
export type ApprovalAction = "EXECUTE" | "MARK_PROCESSED";

export interface ApprovalConfig {
  enabled: boolean;
  /** مبلغ‌های کمتر از این (ریال) نیازی به تأیید دوم ندارند؛ ۰ = همه. */
  minAmountRial: bigint;
}
export const APPROVAL_DISABLED: ApprovalConfig = { enabled: false, minAmountRial: 0n };

export const requiresDualApproval = (amountRial: bigint, cfg: ApprovalConfig): boolean => cfg.enabled && amountRial >= cfg.minAmountRial;

export interface RefundApprovalFacts {
  status: string;
  amountRial: bigint;
  approvalState: ApprovalState;
  approvalAction: ApprovalAction | null;
  approvalRef: string | null;
  makerId: string | null;
}

export type Denial = "approval_not_required" | "not_in_expected_state" | "already_requested" | "already_approved" | "reference_required" | "not_requested" | "self_approval_forbidden" | "approval_required" | "approval_action_mismatch" | "approval_reference_mismatch";
export type Verdict = { ok: true } | { ok: false; code: Denial };

const statusesFor = (a: ApprovalAction): readonly string[] => (a === "EXECUTE" ? EXECUTABLE_STATUSES : MARKABLE_STATUSES);
const deny = (code: Denial): Verdict => ({ ok: false, code });

/** Maker: درخواست تأیید برای یک اقدام. */
export function canRequest(r: RefundApprovalFacts, action: ApprovalAction, reference: string | undefined, cfg: ApprovalConfig): Verdict {
  if (!requiresDualApproval(r.amountRial, cfg)) return deny("approval_not_required");
  if (!statusesFor(action).includes(r.status)) return deny("not_in_expected_state");
  if (action === "MARK_PROCESSED" && !reference) return deny("reference_required");
  if (r.approvalState === "REQUESTED") return deny("already_requested");
  if (r.approvalState === "APPROVED") return deny("already_approved");
  return { ok: true };
}

/** Checker: تأیید/رد؛ نباید همان Maker باشد. */
export function canDecide(r: Pick<RefundApprovalFacts, "approvalState" | "makerId">, actorId: string): Verdict {
  if (r.approvalState !== "REQUESTED") return deny("not_requested");
  if (r.makerId === actorId) return deny("self_approval_forbidden");
  return { ok: true };
}

/** اجرا: اگر تأیید دو نفره لازم است باید تأیید «معتبر برای همین اقدام» موجود باشد. */
export function canConsume(r: RefundApprovalFacts, action: ApprovalAction, reference: string | undefined, cfg: ApprovalConfig): Verdict {
  if (!requiresDualApproval(r.amountRial, cfg)) return { ok: true };
  if (r.approvalState !== "APPROVED") return deny("approval_required");
  if (r.approvalAction !== action) return deny("approval_action_mismatch");
  if (action === "MARK_PROCESSED" && r.approvalRef !== reference) return deny("approval_reference_mismatch");
  return { ok: true };
}
