import { describe, expect, it } from "vitest";
import { loadVideoConfig } from "./video.config";

const S = "s".repeat(32);

describe("loadVideoConfig", () => {
  it("is disabled (not an error) when nothing is configured outside production", () => {
    expect(loadVideoConfig({}).enabled).toBe(false);
  });
  it("is mandatory in production", () => {
    expect(() => loadVideoConfig({ NODE_ENV: "production" })).toThrow(/required in production/);
  });
  it("rejects a partial configuration", () => {
    expect(() => loadVideoConfig({ LIVEKIT_URL: "ws://x:7880" })).toThrow(/together/);
  });
  it("derives the http admin URL from the ws URL", () => {
    const c = loadVideoConfig({ LIVEKIT_URL: "ws://localhost:7880/", LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: S });
    expect(c).toMatchObject({ enabled: true, wsUrl: "ws://localhost:7880", httpUrl: "http://localhost:7880" });
    const d = loadVideoConfig({ LIVEKIT_URL: "wss://lk.example.ir", LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: S });
    expect(d.httpUrl).toBe("https://lk.example.ir");
  });
  it("requires wss:// and a long secret in production", () => {
    const base = { NODE_ENV: "production", LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: S };
    expect(() => loadVideoConfig({ ...base, LIVEKIT_URL: "ws://lk.example.ir" })).toThrow(/wss/);
    expect(() => loadVideoConfig({ ...base, LIVEKIT_URL: "wss://lk.example.ir", LIVEKIT_API_SECRET: "short" })).toThrow(/32/);
  });
  it("validates numeric bounds", () => {
    const e = { LIVEKIT_URL: "ws://x", LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: S };
    expect(() => loadVideoConfig({ ...e, VIDEO_TOKEN_TTL_SEC: "5" })).toThrow();
    expect(loadVideoConfig({ ...e, VIDEO_TOKEN_TTL_SEC: "900" }).tokenTtlSec).toBe(900);
  });
});
