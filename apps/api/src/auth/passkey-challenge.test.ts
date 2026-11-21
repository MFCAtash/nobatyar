import { describe, expect, it } from "vitest";
import { ChallengeStore, readChallenge, webauthnConfig } from "./passkey-challenge";

describe("webauthnConfig", () => {
  it("دامنه را از WEB_ORIGIN استنتاج میکند", () => {
    expect(webauthnConfig({ WEB_ORIGIN: "https://nobatyar.ir/" })).toEqual({ origin: "https://nobatyar.ir", rpID: "nobatyar.ir" });
  });
  it("override صریح مقدم است", () => {
    expect(webauthnConfig({ WEB_ORIGIN: "https://a.ir", WEBAUTHN_ORIGIN: "https://b.ir", WEBAUTHN_RP_ID: "b.ir" })).toEqual({ origin: "https://b.ir", rpID: "b.ir" });
  });
  it("پیشفرض محلی هنگام نبود تنظیم", () => {
    expect(webauthnConfig({})).toEqual({ origin: "http://localhost:3001", rpID: "localhost" });
  });
});

describe("readChallenge", () => {
  it("چالش را از clientDataJSON استخراج میکند", () => {
    const data = Buffer.from(JSON.stringify({ type: "webauthn.create", challenge: "a".repeat(32) })).toString("base64url");
    expect(readChallenge(data)).toBe("a".repeat(32));
  });

  it("داده نامعتبر رد میشود", () => {
    expect(() => readChallenge("not-base64!!")).toThrow();
    expect(() => readChallenge(Buffer.from("{}").toString("base64url"))).toThrow();
  });
});

describe("ChallengeStore", () => {
  it("چالش یکبارمصرف است", () => {
    const s = new ChallengeStore();
    s.remember("challenge-one", "u1");
    expect(s.take("challenge-one", "u1")).toBe("u1");
    expect(() => s.take("challenge-one", "u1")).toThrow();
  });

  it("چالش منقضی رد میشود", () => {
    const s = new ChallengeStore(100);
    s.remember("c2", "u1", 0);
    expect(() => s.take("c2", "u1", 200)).toThrow();
  });

  it("چالش متعلق به کاربر دیگری رد میشود", () => {
    const s = new ChallengeStore();
    s.remember("c3", "u1");
    expect(() => s.take("c3", "u2")).toThrow();
  });
});
