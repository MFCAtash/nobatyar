import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryKv } from "../redis/kv-store";
import { OtpService } from "./otp.service";

const cfg = {
  otpSecret: randomBytes(32), otpLength: 6, otpTtlSec: 120, otpMaxAttempts: 5, otpLockSec: 900,
  otpResendCooldownSec: 60, otpPerPhoneHourly: 3, otpPerIpHourly: 4, otpGlobalDailyCap: 100,
};
const P = "989121234567";

describe("OtpService", () => {
  let t: number;
  let kv: InMemoryKv;
  let sent: string[];
  let otp: OtpService;
  const mk = (sms = { sendOtp: async (_p: string, c: string) => void sent.push(c) }) =>
    new OtpService(kv, sms, cfg, () => new Date(t));

  beforeEach(() => {
    t = 1_000_000;
    kv = new InMemoryKv(() => t);
    sent = [];
    otp = mk();
  });

  it("issues a numeric code and accepts it exactly once", async () => {
    expect(await otp.request(P, "1.1.1.1")).toEqual({ ok: true });
    expect(sent[0]).toMatch(/^\d{6}$/);
    expect(await otp.verify(P, sent[0])).toEqual({ ok: true });
    expect(await otp.verify(P, sent[0])).toEqual({ ok: false, reason: "invalid" });
  });

  it("enforces resend cooldown and per-phone hourly cap", async () => {
    await otp.request(P, "1.1.1.1");
    expect(await otp.request(P, "1.1.1.1")).toMatchObject({ ok: false, reason: "cooldown" });
    t += 61_000; expect((await otp.request(P, "1.1.1.1")).ok).toBe(true);
    t += 61_000; expect((await otp.request(P, "1.1.1.1")).ok).toBe(true);
    t += 61_000; expect(await otp.request(P, "1.1.1.1")).toMatchObject({ ok: false, reason: "rate_limited" });
  });

  it("enforces per-IP cap across different phones", async () => {
    for (let i = 0; i < 4; i++) expect((await otp.request(`98912000000${i}`, "9.9.9.9")).ok).toBe(true);
    expect(await otp.request("989129999999", "9.9.9.9")).toMatchObject({ ok: false, reason: "rate_limited" });
  });

  it("locks after max wrong attempts, even for the correct code", async () => {
    await otp.request(P, "2.2.2.2");
    const good = sent[0];
    const wrong = good === "111111" ? "222222" : "111111";
    for (let i = 0; i < 4; i++) expect(await otp.verify(P, wrong)).toEqual({ ok: false, reason: "invalid" });
    expect(await otp.verify(P, wrong)).toMatchObject({ ok: false, reason: "locked" });
    expect(await otp.verify(P, good)).toMatchObject({ ok: false, reason: "locked" });
    t += 901_000;
    expect(await otp.verify(P, good)).toEqual({ ok: false, reason: "invalid" }); // کد باطل شده بود
  });

  it("expires codes", async () => {
    await otp.request(P, "3.3.3.3");
    t += 121_000;
    expect((await otp.verify(P, sent[0])).ok).toBe(false);
  });

  it("concurrent verification of one code succeeds only once", async () => {
    await otp.request(P, "4.4.4.4");
    const rs = await Promise.all(Array.from({ length: 10 }, () => otp.verify(P, sent[0])));
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
  });

  it("rolls back code and cooldown when SMS delivery fails", async () => {
    const failing = mk({ sendOtp: async () => { throw new Error("down"); } });
    await expect(failing.request(P, "5.5.5.5")).rejects.toThrow("down");
    expect((await otp.request(P, "5.5.5.5")).ok).toBe(true);
  });

  it("does not store raw phone or code in KV keys/values", async () => {
    await otp.request(P, "6.6.6.6");
    const dump = JSON.stringify([...(kv as unknown as { m: Map<string, { v: string }> }).m.entries()]);
    expect(dump).not.toContain(P);
    expect(dump).not.toContain(sent[0]);
  });
});
