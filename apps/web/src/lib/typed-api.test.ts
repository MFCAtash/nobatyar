import { describe, expect, it } from "vitest";
import { OPERATIONS } from "./api-types.generated";
import { buildRequest, createTypedApi } from "./typed-api";

const KEY = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

describe("buildRequest", () => {
  it("substitutes and encodes path params", () => {
    const r = buildRequest("POST /admin/refunds/{id}/execute", { params: { id: "a/b c" }, idempotencyKey: KEY } as never);
    expect(r.path).toBe("/admin/refunds/a%2Fb%20c/execute");
    expect(r.init.method).toBe("POST");
    expect(r.init.headers).toEqual({ "Idempotency-Key": KEY });
  });
  it("money endpoints refuse to run without an idempotency key", () => {
    expect(() => buildRequest("POST /admin/refunds/{id}/execute", { params: { id: "x" } } as never)).toThrow();
    expect(() => buildRequest("POST /payments/initiate", { body: { appointmentId: "x" } } as never)).toThrow();
  });
  it("query: skips undefined, stringifies numbers, no '?' when empty", () => {
    expect(buildRequest("GET /admin/refunds", { query: { status: "REVIEW", limit: 20 } } as never).path).toBe("/admin/refunds?status=REVIEW&limit=20");
    expect(buildRequest("GET /admin/refunds", { query: {} } as never).path).toBe("/admin/refunds");
  });
  it("public routes skip auth; GET has no body; POST without body sends {}", () => {
    expect(buildRequest("POST /auth/otp/request", { body: { phone: "0912" } } as never).init.auth).toBe(false);
    expect(buildRequest("GET /me", {} as never).init.body).toBeUndefined();
    expect(buildRequest("POST /admin/users/{id}/reinstate", { params: { id: "u" } } as never).init.body).toEqual({});
  });
  it("a missing path param is an error, not '/undefined'", () => {
    expect(() => buildRequest("DELETE /me/family/{id}", {} as never)).toThrow(/id/);
  });
});

describe("generated metadata", () => {
  it("every Idempotency-Key 'required' operation in the spec is a POST", () => {
    for (const o of Object.values(OPERATIONS)) if (o.idempotency === "required") expect(o.method).toBe("POST");
  });
  it("refund money operations are all marked required", () => {
    for (const k of ["execute", "mark-processed", "request-approval", "approval/approve", "approval/reject"]) expect(OPERATIONS[`POST /admin/refunds/{id}/${k}` as keyof typeof OPERATIONS].idempotency).toBe("required");
    expect(OPERATIONS["POST /payments/initiate"].idempotency).toBe("required");
  });
});

describe("createTypedApi", () => {
  it("delegates to api.request with the built path and init", async () => {
    const calls: unknown[][] = [];
    const typed = createTypedApi({ request: (async (...a: unknown[]) => { calls.push(a); return { ok: 1 }; }) as never });
    await typed.call("POST /admin/users/{id}/suspend", { params: { id: "u1" }, body: { reason: "سوءاستفاده" } });
    expect(calls[0]).toEqual(["/admin/users/u1/suspend", { method: "POST", body: { reason: "سوءاستفاده" } }]);
  });
});
