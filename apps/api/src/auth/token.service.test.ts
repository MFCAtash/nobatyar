import { randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { TokenService } from "./token.service";

const secret = randomBytes(32);
const svc = new TokenService({ accessSecret: secret, accessTtlSec: 900 });

describe("TokenService", () => {
  const SID = "6f1c2a52-2f0a-4c6e-9a3e-0d3f6b9b1a11";
  it("round-trips claims (without sid: legacy token)", async () => {
    const { token } = await svc.signAccess({ sub: "u1", role: "DOCTOR" });
    const v = await svc.verifyAccess(token);
    expect(v).toMatchObject({ sub: "u1", role: "DOCTOR" });
    expect(v?.sid).toBeUndefined();
    expect(v!.exp - v!.iat).toBe(900);
    expect(Math.abs(v!.iatMs - Date.now())).toBeLessThan(5_000); // claim ی ims (دقت ms)
  });
  it("carries sid and rejects a malformed sid", async () => {
    const { token } = await svc.signAccess({ sub: "u1", role: "PATIENT", sid: SID });
    expect((await svc.verifyAccess(token))?.sid).toBe(SID);
    const bad = await new SignJWT({ role: "PATIENT", sid: "not-a-uuid" }).setProtectedHeader({ alg: "HS256" }).setSubject("u1")
      .setIssuer("nobatyar").setAudience("nobatyar-api").setIssuedAt().setExpirationTime("5m").sign(secret);
    expect(await svc.verifyAccess(bad)).toBeNull();
  });
  it("rejects a token signed with another key", async () => {
    const other = new TokenService({ accessSecret: randomBytes(32), accessTtlSec: 900 });
    const { token } = await other.signAccess({ sub: "u1", role: "ADMIN" });
    expect(await svc.verifyAccess(token)).toBeNull();
  });
  it("rejects expired, wrong-audience and invalid-role tokens", async () => {
    const mk = (o: { aud?: string; exp?: number | string; role?: string }) =>
      new SignJWT({ role: o.role ?? "PATIENT" }).setProtectedHeader({ alg: "HS256" }).setSubject("u1")
        .setIssuer("nobatyar").setAudience(o.aud ?? "nobatyar-api").setExpirationTime(o.exp ?? "5m").sign(secret);
    expect(await svc.verifyAccess(await mk({ aud: "other" }))).toBeNull();
    expect(await svc.verifyAccess(await mk({ exp: Math.floor(Date.now() / 1000) - 60 }))).toBeNull();
    expect(await svc.verifyAccess(await mk({ role: "SUPERUSER" }))).toBeNull();
  });
  it("rejects alg=none and garbage", async () => {
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from('{"sub":"u1","role":"ADMIN"}').toString("base64url")}.`;
    expect(await svc.verifyAccess(none)).toBeNull();
    expect(await svc.verifyAccess("not-a-jwt")).toBeNull();
  });
});
