import { describe, expect, it } from "vitest";
import { InMemoryKv } from "../redis/kv-store";
import { decide, SessionRevocation, SessionRevocationUnavailable } from "./session-revocation";

const SID = "6f1c2a52-2f0a-4c6e-9a3e-0d3f6b9b1a11";
const strict = { requireSid: true };

describe("decide()", () => {
  it("accepts a clean token", () => expect(decide({ sid: SID, iatMs: 100 }, false, null, strict)).toBe("ok"));
  it("rejects a revoked sid", () => expect(decide({ sid: SID, iatMs: 100 }, true, null, strict)).toBe("revoked"));
  it("rejects tokens issued at/before the user cutoff, accepts later ones", () => {
    expect(decide({ sid: SID, iatMs: 100 }, false, 100, strict)).toBe("revoked");
    expect(decide({ sid: SID, iatMs: 99 }, false, 100, strict)).toBe("revoked");
    expect(decide({ sid: SID, iatMs: 101 }, false, 100, strict)).toBe("ok");
  });
  it("legacy tokens (no sid): rejected when sid is required, allowed during rollout", () => {
    expect(decide({ iatMs: 100 }, false, null, strict)).toBe("missing_sid");
    expect(decide({ iatMs: 100 }, false, null, { requireSid: false })).toBe("ok");
    expect(decide({ iatMs: 100 }, false, 200, { requireSid: false })).toBe("revoked");
  });
});

describe("SessionRevocation (Redis-backed)", () => {
  const mk = (failOpen = false, now = 1_000_000) => {
    let t = now;
    const kv = new InMemoryKv(() => t);
    return { svc: new SessionRevocation(kv, 900, strict, failOpen, () => t), kv, advance: (ms: number) => { t += ms; } };
  };

  it("logout of one session leaves other sessions of the same user valid", async () => {
    const { svc } = mk();
    await svc.revokeSession(SID);
    expect(await svc.check({ sub: "u1", sid: SID, iatMs: 1 })).toBe("revoked");
    expect(await svc.check({ sub: "u1", sid: "0b7e4c1d-7a55-4b70-8f4b-5b6f8e9d1c22", iatMs: 1 })).toBe("ok");
  });
  it("revokeUser kills every older token but not a freshly issued one", async () => {
    const { svc } = mk(false, 5_000_000);
    await svc.revokeUser("u1");
    expect(await svc.check({ sub: "u1", sid: SID, iatMs: 4_999_999 })).toBe("revoked"); // پیش از ابطال
    expect(await svc.check({ sub: "u1", sid: SID, iatMs: 5_000_000 })).toBe("revoked"); // هم‌میلی‌ثانیه (جهت امن)
    expect(await svc.check({ sub: "u1", sid: SID, iatMs: 5_000_001 })).toBe("ok");     // یک میلی‌ثانیه بعد: معتبر (refresh پس از تغییر نقش)
    expect(await svc.check({ sub: "u2", sid: SID, iatMs: 4_999_999 })).toBe("ok");
  });
  it("revocation entries expire after the TTL (bounded memory)", async () => {
    let clock = 0;
    const kv = new InMemoryKv(() => clock);
    const svc = new SessionRevocation(kv, 900, strict, false, () => clock);
    await svc.revokeSession(SID);
    clock += 901_000;
    expect(await svc.check({ sub: "u1", sid: SID, iatMs: 1 })).toBe("ok");
  });
  it("fails closed when Redis is down (default) and open when configured", async () => {
    const broken = { get: async () => { throw new Error("down"); }, set: async () => { throw new Error("down"); } };
    await expect(new SessionRevocation(broken, 900, strict, false).check({ sub: "u", sid: SID, iatMs: 1 })).rejects.toBeInstanceOf(SessionRevocationUnavailable);
    expect(await new SessionRevocation(broken, 900, strict, true).check({ sub: "u", sid: SID, iatMs: 1 })).toBe("ok");
    expect(await new SessionRevocation(broken, 900, strict, true).check({ sub: "u", iatMs: 1 })).toBe("missing_sid");
  });
});
