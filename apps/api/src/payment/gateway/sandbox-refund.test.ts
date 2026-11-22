import { describe, expect, it } from "vitest";
import { SandboxGateway, type SandboxMode } from "./sandbox.gateway";

const request = { amountRial: 50_000n, callbackUrl: "http://localhost/cb", orderId: "order-1" };

describe("M4 sandbox gateway — refund path in CI", () => {
  it("accepts a sandbox refund and returns a stable external reference", async () => {
    const g = new SandboxGateway("success", false);
    const req = await g.request(request);
    expect(req.authority.startsWith("SANDBOX-")).toBe(true);
    const paid = await g.verify({ authority: req.authority, orderId: request.orderId, amountRial: request.amountRial });
    expect(paid.kind).toBe("PAID");
    const refund = await g.refund({ authority: req.authority });
    expect(refund.kind).toBe("ACCEPTED");
    expect(refund.externalRef).toMatch(/^SBX-REFUND-/);
    expect(refund.gatewayStatus).toBe("PENDING"); // نتیجهٔ مبهم ⇒ RefundService آن را REVIEW میکند
  });

  it("rejects a non-sandbox authority", async () => {
    const g = new SandboxGateway("success", false);
    expect((await g.refund({ authority: "REAL-AUTHORITY" })).kind).toBe("REJECTED");
  });

  it("never produces a paid verdict in failure/pending modes", async () => {
    const modes: SandboxMode[] = ["fail", "pending"];
    for (const mode of modes) {
      const g = new SandboxGateway(mode, false);
      const req = await g.request(request);
      const v = await g.verify({ authority: req.authority, orderId: request.orderId, amountRial: request.amountRial });
      expect(v.kind).toBe("NOT_PAID");
      expect((await g.inquire({ authority: req.authority })).kind).toBe(mode === "fail" ? "FAILED" : "PENDING");
    }
  });

  it("is impossible to construct in production", () => {
    expect(() => new SandboxGateway("success", true)).toThrow(/production/);
  });
});
