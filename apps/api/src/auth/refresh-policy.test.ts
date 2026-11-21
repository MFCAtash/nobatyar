import { describe, expect, it } from "vitest";
import { evaluateRefresh, generateRefreshToken, hashRefreshToken } from "./refresh-policy";
import { isCsrfSafe, readCookie } from "./http-security";

const now = new Date();
const later = new Date(+now + 1e6);

describe("evaluateRefresh", () => {
  it("covers all decisions", () => {
    expect(evaluateRefresh(null, now)).toBe("unknown");
    expect(evaluateRefresh({ revokedAt: now, expiresAt: later }, now)).toBe("reuse");
    expect(evaluateRefresh({ revokedAt: null, expiresAt: new Date(+now - 1) }, now)).toBe("expired");
    expect(evaluateRefresh({ revokedAt: null, expiresAt: later }, now)).toBe("ok");
  });
  it("generates unique high-entropy tokens whose hash is stable", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(43);
    expect(hashRefreshToken(a.token)).toBe(a.hash);
  });
});

describe("http security helpers", () => {
  it("reads cookies", () => {
    expect(readCookie("a=1; nb_refresh=abc%3D; b=2", "nb_refresh")).toBe("abc=");
    expect(readCookie(undefined, "x")).toBeUndefined();
  });
  it("CSRF: custom header required, Origin must be allowed", () => {
    expect(isCsrfSafe({}, [])).toBe(false);
    expect(isCsrfSafe({ "x-nobatyar-csrf": "1" }, [])).toBe(true);
    expect(isCsrfSafe({ "x-nobatyar-csrf": "1", origin: "https://evil.example" }, ["https://app.example"])).toBe(false);
    expect(isCsrfSafe({ "x-nobatyar-csrf": "1", origin: "https://app.example" }, ["https://app.example"])).toBe(true);
  });
});
