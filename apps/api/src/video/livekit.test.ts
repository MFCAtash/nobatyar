import { createHash } from "node:crypto";
import { decodeJwt, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { LiveKitRoomAdmin, mintJoinToken, verifyWebhook } from "./livekit";

const KEY = "APIkey";
const SECRET = "x".repeat(40);
const enc = (s: string) => new TextEncoder().encode(s);

async function signedWebhook(body: string, over: { secret?: string; iss?: string; sha?: string } = {}) {
  const sha = over.sha ?? createHash("sha256").update(body, "utf8").digest("base64");
  return new SignJWT({ sha256: sha })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(over.iss ?? KEY)
    .setNotBefore(Math.floor(Date.now() / 1000) - 5)
    .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
    .sign(enc(over.secret ?? SECRET));
}

describe("mintJoinToken", () => {
  it("produces a LiveKit-shaped JWT scoped to one room and identity", async () => {
    const now = new Date("2026-10-20T10:00:00Z");
    const exp = Math.floor(now.getTime() / 1000) + 600;
    const t = await mintJoinToken({ apiKey: KEY, apiSecret: SECRET, room: "visit-1", identity: "u_abc", name: "دکتر", metadata: { role: "doctor" }, expiresAtSec: exp, now });
    const c = decodeJwt(t) as Record<string, any>;
    expect(c.iss).toBe(KEY);
    expect(c.sub).toBe("u_abc");
    expect(c.exp).toBe(exp);
    expect(c.nbf).toBeLessThan(c.iat + 1);
    expect(c.video).toMatchObject({ room: "visit-1", roomJoin: true, canPublish: true, canSubscribe: true });
    expect(c.video.roomAdmin).toBeUndefined();
    expect(c.video.roomCreate).toBeUndefined();
    expect(JSON.parse(c.metadata)).toEqual({ role: "doctor" });
  });
});

describe("verifyWebhook", () => {
  const body = JSON.stringify({ event: "participant_joined", id: "EV_1", room: { name: "visit-1" }, participant: { identity: "u_abc" } });

  it("accepts a correctly signed webhook", async () => {
    const ev = await verifyWebhook(body, await signedWebhook(body), KEY, SECRET);
    expect(ev?.event).toBe("participant_joined");
  });
  it("rejects a tampered body (hash mismatch)", async () => {
    const auth = await signedWebhook(body);
    expect(await verifyWebhook(body.replace("EV_1", "EV_2"), auth, KEY, SECRET)).toBeNull();
  });
  it("rejects a wrong secret, wrong issuer, missing header or empty body", async () => {
    expect(await verifyWebhook(body, await signedWebhook(body, { secret: "y".repeat(40) }), KEY, SECRET)).toBeNull();
    expect(await verifyWebhook(body, await signedWebhook(body, { iss: "other" }), KEY, SECRET)).toBeNull();
    expect(await verifyWebhook(body, undefined, KEY, SECRET)).toBeNull();
    expect(await verifyWebhook("", await signedWebhook(body), KEY, SECRET)).toBeNull();
  });
  it("rejects a token without the sha256 claim", async () => {
    const t = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setIssuer(KEY).setExpirationTime("5m").sign(enc(SECRET));
    expect(await verifyWebhook(body, t, KEY, SECRET)).toBeNull();
  });
  it("rejects alg=none style forgeries", async () => {
    const forged = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({ iss: KEY, sha256: createHash("sha256").update(body).digest("base64") })).toString("base64url")}.`;
    expect(await verifyWebhook(body, forged, KEY, SECRET)).toBeNull();
  });
});

describe("LiveKitRoomAdmin", () => {
  it("calls Twirp DeleteRoom with a roomAdmin token and treats 404 as success", async () => {
    const calls: { url: string; auth: string; body: string }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, auth: (init.headers as Record<string, string>).Authorization, body: String(init.body) });
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;
    const admin = new LiveKitRoomAdmin("http://lk:7880", KEY, SECRET, f);
    await admin.deleteRoom("visit-1");
    expect(calls[0].url).toBe("http://lk:7880/twirp/livekit.RoomService/DeleteRoom");
    expect(JSON.parse(calls[0].body)).toEqual({ room: "visit-1" });
    const claims = decodeJwt(calls[0].auth.replace("Bearer ", "")) as Record<string, any>;
    expect(claims.iss).toBe(KEY);
    expect(claims.video).toMatchObject({ roomAdmin: true, room: "visit-1" });
  });
  it("throws on server errors so the caller can log", async () => {
    const f = (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;
    await expect(new LiveKitRoomAdmin("http://lk", KEY, SECRET, f).deleteRoom("r")).rejects.toThrow(/500/);
  });
});
