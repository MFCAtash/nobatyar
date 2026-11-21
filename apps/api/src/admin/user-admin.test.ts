import { describe, expect, it } from "vitest";
import { decideReinstate, decideSuspend, suspendSchema } from "./user-admin";

describe("decideSuspend", () => {
  const u = { id: "u1", role: "PATIENT", status: "ACTIVE" as const };
  it("allows suspending an active non-admin", () => expect(decideSuspend("a1", u)).toEqual({ ok: true }));
  it("refuses self, other admins, deleted and already-suspended", () => {
    expect(decideSuspend("u1", u)).toEqual({ ok: false, code: "cannot_suspend_self" });
    expect(decideSuspend("a1", { ...u, role: "ADMIN" })).toEqual({ ok: false, code: "cannot_suspend_admin" });
    expect(decideSuspend("a1", { ...u, status: "DELETED" })).toEqual({ ok: false, code: "user_deleted" });
    expect(decideSuspend("a1", { ...u, status: "SUSPENDED" })).toEqual({ ok: false, code: "already_suspended" });
  });
});
describe("decideReinstate / schema", () => {
  it("only SUSPENDED users can be reinstated", () => {
    expect(decideReinstate({ status: "SUSPENDED" })).toEqual({ ok: true });
    expect(decideReinstate({ status: "ACTIVE" })).toEqual({ ok: false, code: "not_suspended" });
    expect(decideReinstate({ status: "DELETED" })).toEqual({ ok: false, code: "user_deleted" });
  });
  it("suspend needs a reason and rejects unknown keys", () => {
    expect(suspendSchema.safeParse({ reason: "ab" }).success).toBe(false);
    expect(suspendSchema.safeParse({ reason: "سوءاستفاده از سامانه" }).success).toBe(true);
    expect(suspendSchema.safeParse({ reason: "valid reason", extra: 1 }).success).toBe(false);
  });
});
