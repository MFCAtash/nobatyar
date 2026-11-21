import { describe, expect, it } from "vitest";
import { ApiError } from "../api";
import { qk } from "./keys";

// client.ts به @tanstack/react-query وابسته است؛ منطق retry را از طریق ماژول جدا تست می‌کنیم.
import { retryDelay, shouldRetry } from "./retry-policy";

describe("retry policy", () => {
  it("retries network and 5xx up to twice", () => {
    expect(shouldRetry(0, new ApiError(0, "network"))).toBe(true);
    expect(shouldRetry(1, new ApiError(503, "http_503"))).toBe(true);
    expect(shouldRetry(2, new ApiError(503, "http_503"))).toBe(false);
  });
  it("never retries 4xx (except 408)", () => {
    for (const s of [400, 401, 403, 404, 409, 429]) expect(shouldRetry(0, new ApiError(s, "x"))).toBe(false);
    expect(shouldRetry(0, new ApiError(408, "timeout"))).toBe(true);
  });
  it("backs off exponentially with a cap", () => {
    expect([0, 1, 2, 5].map(retryDelay)).toEqual([1000, 2000, 4000, 8000]);
  });
});

describe("query keys", () => {
  it("are stable and distinct", () => {
    expect(qk.doctors({ q: "a", specialty: "" })).toEqual(qk.doctors({ q: "a", specialty: "" }));
    expect(qk.slots("d1", "2026-10-13")).not.toEqual(qk.slots("d1", "2026-10-14"));
  });
});
