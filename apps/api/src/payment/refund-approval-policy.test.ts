import { describe, expect, it } from "vitest";
import { APPROVAL_DISABLED, canConsume, canDecide, canRequest, requiresDualApproval, type ApprovalConfig, type RefundApprovalFacts } from "./refund-approval-policy";

const on: ApprovalConfig = { enabled: true, minAmountRial: 0n };
const facts = (o: Partial<RefundApprovalFacts> = {}): RefundApprovalFacts => ({ status: "PENDING", amountRial: 500_000n, approvalState: "NONE", approvalAction: null, approvalRef: null, makerId: null, ...o });

describe("requiresDualApproval", () => {
  it("disabled ⇒ never; enabled ⇒ at/above threshold", () => {
    expect(requiresDualApproval(10n, APPROVAL_DISABLED)).toBe(false);
    expect(requiresDualApproval(10n, on)).toBe(true);
    expect(requiresDualApproval(999n, { enabled: true, minAmountRial: 1000n })).toBe(false);
    expect(requiresDualApproval(1000n, { enabled: true, minAmountRial: 1000n })).toBe(true);
  });
});

describe("maker: canRequest", () => {
  it("allows a request for an executable refund", () => expect(canRequest(facts(), "EXECUTE", undefined, on)).toEqual({ ok: true }));
  it("REVIEW can be marked-processed but not executed", () => {
    expect(canRequest(facts({ status: "REVIEW" }), "EXECUTE", undefined, on)).toEqual({ ok: false, code: "not_in_expected_state" });
    expect(canRequest(facts({ status: "REVIEW" }), "MARK_PROCESSED", "bank-ref-1", on)).toEqual({ ok: true });
  });
  it("mark-processed needs the external reference up-front", () => expect(canRequest(facts(), "MARK_PROCESSED", undefined, on)).toEqual({ ok: false, code: "reference_required" }));
  it("no double request; below threshold ⇒ not required; PROCESSED/PROCESSING refused", () => {
    expect(canRequest(facts({ approvalState: "REQUESTED" }), "EXECUTE", undefined, on)).toEqual({ ok: false, code: "already_requested" });
    expect(canRequest(facts({ approvalState: "APPROVED" }), "EXECUTE", undefined, on)).toEqual({ ok: false, code: "already_approved" });
    expect(canRequest(facts(), "EXECUTE", undefined, APPROVAL_DISABLED)).toEqual({ ok: false, code: "approval_not_required" });
    for (const status of ["PROCESSED", "PROCESSING"]) expect(canRequest(facts({ status }), "EXECUTE", undefined, on).ok).toBe(false);
  });
  it("a rejected request can be re-requested", () => expect(canRequest(facts({ approvalState: "REJECTED" }), "EXECUTE", undefined, on)).toEqual({ ok: true }));
});

describe("checker: canDecide", () => {
  it("a different admin may decide a pending request", () => expect(canDecide({ approvalState: "REQUESTED", makerId: "A" }, "B")).toEqual({ ok: true }));
  it("the maker can never approve their own request", () => expect(canDecide({ approvalState: "REQUESTED", makerId: "A" }, "A")).toEqual({ ok: false, code: "self_approval_forbidden" }));
  it("only REQUESTED can be decided", () => {
    for (const s of ["NONE", "APPROVED", "REJECTED"] as const) expect(canDecide({ approvalState: s, makerId: "A" }, "B")).toEqual({ ok: false, code: "not_requested" });
  });
});

describe("execution: canConsume", () => {
  it("requires a matching approval", () => {
    expect(canConsume(facts(), "EXECUTE", undefined, on)).toEqual({ ok: false, code: "approval_required" });
    expect(canConsume(facts({ approvalState: "REQUESTED" }), "EXECUTE", undefined, on)).toEqual({ ok: false, code: "approval_required" });
    expect(canConsume(facts({ approvalState: "APPROVED", approvalAction: "EXECUTE" }), "EXECUTE", undefined, on)).toEqual({ ok: true });
  });
  it("an approval for one action is not valid for another", () => {
    expect(canConsume(facts({ approvalState: "APPROVED", approvalAction: "MARK_PROCESSED", approvalRef: "r" }), "EXECUTE", undefined, on)).toEqual({ ok: false, code: "approval_action_mismatch" });
  });
  it("mark-processed must use exactly the approved reference", () => {
    const f = facts({ approvalState: "APPROVED", approvalAction: "MARK_PROCESSED", approvalRef: "bank-ref-1" });
    expect(canConsume(f, "MARK_PROCESSED", "bank-ref-1", on)).toEqual({ ok: true });
    expect(canConsume(f, "MARK_PROCESSED", "bank-ref-2", on)).toEqual({ ok: false, code: "approval_reference_mismatch" });
  });
  it("disabled ⇒ always allowed (backward compatible)", () => expect(canConsume(facts(), "EXECUTE", undefined, APPROVAL_DISABLED)).toEqual({ ok: true }));
});
