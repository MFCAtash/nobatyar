import { describe, expect, it } from "vitest";
import { ApiError, createApi } from "./api";
import { errorMessage } from "./messages";

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("api client", () => {
  it("refreshes once for many concurrent 401s (single-flight) and retries each request", async () => {
    let refreshCalls = 0;
    const api = createApi({
      fetchImpl: async (url, init) => {
        const h = new Headers(init?.headers);
        if (String(url).endsWith("/auth/refresh")) {
          refreshCalls++;
          expect(h.get("x-nobatyar-csrf")).toBe("1");
          expect(h.get("authorization")).toBeNull();
          await new Promise((r) => setTimeout(r, 20));
          return json(200, { accessToken: "T2" });
        }
        return h.get("authorization") === "Bearer T2" ? json(200, { ok: true }) : json(401, { error: "unauthorized" });
      },
    });
    api.setToken("T1");
    await Promise.all([1, 2, 3, 4, 5].map((i) => api.get(`/x${i}`)));
    expect(refreshCalls).toBe(1);
    expect(api.getToken()).toBe("T2");
  });

  it("denied refresh → onAuthLost once, no retry loop", async () => {
    let lost = 0, calls = 0;
    const api = createApi({
      onAuthLost: () => lost++,
      fetchImpl: async (url) => { calls++; return String(url).endsWith("/auth/refresh") ? json(401, { error: "invalid_refresh" }) : json(401, { error: "unauthorized" }); },
    });
    api.setToken("old");
    await expect(api.get("/me")).rejects.toMatchObject({ status: 401 });
    expect({ lost, calls, token: api.getToken() }).toEqual({ lost: 1, calls: 2, token: null });
  });

  it("a transient refresh failure does not log the user out", async () => {
    let lost = 0;
    const api = createApi({ onAuthLost: () => lost++, fetchImpl: async (url) => (String(url).endsWith("/auth/refresh") ? json(503) : json(401, { error: "unauthorized" })) });
    await expect(api.get("/me")).rejects.toBeInstanceOf(ApiError);
    expect(lost).toBe(0);
  });

  it("maps network failures and API errors", async () => {
    const net = createApi({ fetchImpl: async () => { throw new TypeError("offline"); } });
    await expect(net.get("/me")).rejects.toMatchObject({ status: 0, code: "network" });
    const api = createApi({ fetchImpl: async () => json(409, { error: "slot_taken" }) });
    await expect(api.post("/appointments", {})).rejects.toMatchObject({ status: 409, code: "slot_taken" });
  });

  it("login/logout never send stale credentials or trigger refresh", async () => {
    const api = createApi({
      fetchImpl: async (url, init) => {
        const u = String(url), h = new Headers(init?.headers);
        if (u.endsWith("/otp/verify")) { expect(h.get("authorization")).toBeNull(); return json(200, { accessToken: "AT" }); }
        if (u.endsWith("/auth/logout")) { expect(h.get("x-nobatyar-csrf")).toBe("1"); return new Response(null, { status: 204 }); }
        throw new Error(`unexpected ${u}`);
      },
    });
    await api.verifyOtp("0912", "123456");
    expect(api.getToken()).toBe("AT");
    await api.logout();
    expect(api.getToken()).toBeNull();
  });

  it("two tabs sharing a lock + channel perform exactly ONE refresh (server would revoke on reuse)", async () => {
    class Chan {
      static all: Chan[] = [];
      onmessage: ((e: { data: unknown }) => void) | null = null;
      constructor() { Chan.all.push(this); }
      postMessage(m: unknown) { for (const c of Chan.all) if (c !== this) queueMicrotask(() => c.onmessage?.({ data: m })); }
    }
    let tail: Promise<unknown> = Promise.resolve();
    const locks = { request<T>(_n: string, cb: () => Promise<T>): Promise<T> { const p = tail.then(cb, cb); tail = p.catch(() => undefined); return p; } };
    let refreshCalls = 0;
    const server = async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith("/auth/refresh")) { refreshCalls++; await new Promise((r) => setTimeout(r, 15)); return refreshCalls === 1 ? json(200, { accessToken: "NEW" }) : json(401, { error: "invalid_refresh" }); }
      return new Headers(init?.headers).get("authorization") === "Bearer NEW" ? json(200, { ok: 1 }) : json(401, {});
    };
    const mk = () => createApi({ fetchImpl: server as typeof fetch, locks, channel: new Chan() });
    const A = mk(), B = mk();
    A.setToken("OLD"); B.setToken("OLD");
    await Promise.all([A.get("/me"), B.get("/me")]);
    expect(refreshCalls).toBe(1);
    expect([A.getToken(), B.getToken()]).toEqual(["NEW", "NEW"]);
  });

  it("bootstrap distinguishes ok / denied / transient error (transient never means logged out)", async () => {
    const mk = (res: () => Response | Promise<Response>) => createApi({ fetchImpl: async () => res() });
    const ok = mk(() => json(200, { accessToken: "T" }));
    expect(await ok.bootstrap()).toBe("ok");
    expect(ok.getToken()).toBe("T");
    expect(await mk(() => json(401, { error: "invalid_refresh" })).bootstrap()).toBe("denied");
    expect(await mk(() => json(503)).bootstrap()).toBe("error");
    expect(await mk(() => { throw new TypeError("offline"); }).bootstrap()).toBe("error");
  });

  it("logout in one tab signs the other tab out (onAuthLost) without calling the server again", async () => {
    class Chan {
      static all: Chan[] = [];
      onmessage: ((e: { data: unknown }) => void) | null = null;
      constructor() { Chan.all.push(this); }
      postMessage(m: unknown) { for (const c of Chan.all) if (c !== this) queueMicrotask(() => c.onmessage?.({ data: m })); }
    }
    let lostB = 0, logoutCalls = 0;
    const server = async (url: RequestInfo | URL) => { if (String(url).endsWith("/auth/logout")) logoutCalls++; return new Response(null, { status: 204 }); };
    const A = createApi({ fetchImpl: server as typeof fetch, channel: new Chan() });
    const B = createApi({ fetchImpl: server as typeof fetch, channel: new Chan(), onAuthLost: () => lostB++ });
    A.setToken("T"); B.setToken("T");
    await A.logout();
    await new Promise((r) => setTimeout(r, 5));
    expect({ a: A.getToken(), b: B.getToken(), lostB, logoutCalls }).toEqual({ a: null, b: null, lostB: 1, logoutCalls: 1 });
  });
});

describe("errorMessage", () => {
  it("returns Persian user-facing text and hides technical details", () => {
    expect(errorMessage(new ApiError(409, "slot_taken"))).toMatch(/رزرو شد/);
    expect(errorMessage(new ApiError(429, "too_many_requests", { retryAfterSec: 900 }))).toMatch(/۱۵|15/);
    expect(errorMessage(new ApiError(500, "http_500"))).toBe("خطای سرور. کمی بعد دوباره امتحان کنید.");
    expect(errorMessage(new Error("secret stack"))).toBe("خطای ناشناخته.");
  });
});
