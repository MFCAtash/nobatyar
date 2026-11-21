/**
 * کلاینت API.
 *  - access token فقط در حافظه (نه localStorage)؛ refresh token در کوکی HttpOnly است و از JS دیده نمی‌شود.
 *  - ⚠️ سرور «استفاده‌ی مجدد از refresh token» را سرقت می‌داند و کل نشست را باطل می‌کند. پس refresh باید
 *    هم‌زمان فقط یک‌بار انجام شود: (۱) single-flight داخل یک تب، (۲) قفل Web Locks بین تب‌ها،
 *    (۳) اشتراک توکن تازه بین تب‌ها با BroadcastChannel.
 */
export class ApiError extends Error {
  constructor(public status: number, public code: string, public body?: unknown) {
    super(code);
    this.name = "ApiError";
  }
  get retryAfterSec(): number | undefined {
    const v = (this.body as { retryAfterSec?: unknown } | undefined)?.retryAfterSec;
    return typeof v === "number" ? v : undefined;
  }
}

export interface LocksLike {
  request<T>(name: string, cb: () => Promise<T>): Promise<T>;
}
export interface ChannelLike {
  postMessage(msg: unknown): void;
  onmessage: ((e: { data: unknown }) => void) | null;
}

export interface ApiOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  locks?: LocksLike | null;
  channel?: ChannelLike | null;
  now?: () => number;
  freshWindowMs?: number;
  onAuthLost?: () => void;
  /** ادمین دارای MFA ولی بدون claim مfa — نشست معتبر است، فقط چالش لازم است. */
  onMfaRequired?: (err: ApiError) => void;
}

/** تشخیص چالش MFA — بدنهٔ خطا دقیقاً `{ error: "mfa_required" }` است. */
export function isMfaRequired(e: unknown): e is ApiError {
  return e instanceof ApiError && e.status === 403 && e.code === "mfa_required";
}

type RefreshResult = { status: "ok"; token: string } | { status: "denied" } | { status: "error" };

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** false = بدون Authorization و بدون تلاش refresh (ورود/خروج) */
  auth?: boolean;
  headers?: Record<string, string>;
}

export const CSRF_HEADER = "X-Nobatyar-Csrf";

export function createApi(opts: ApiOptions = {}) {
  const base = opts.baseUrl ?? "/api/v1";
  const fetchImpl = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const now = opts.now ?? Date.now;
  const freshWindowMs = opts.freshWindowMs ?? 10_000;
  const locks = opts.locks ?? null;
  const channel = opts.channel ?? null;

  let token: string | null = null;
  let shared: { token: string; at: number } | null = null;
  let inflight: Promise<RefreshResult> | null = null;

  if (channel) {
    channel.onmessage = (e) => {
      const d = e.data as { token?: string; at?: number; logout?: boolean } | null;
      if (d && d.logout === true) {
        // خروج در تب دیگر
        token = null;
        shared = null;
        opts.onAuthLost?.();
        return;
      }
      if (d && typeof d.token === "string" && typeof d.at === "number") {
        shared = { token: d.token, at: d.at };
        token = d.token; // توکن تازه‌ی تب دیگر
      }
    };
  }

  function setToken(t: string | null) {
    token = t;
    if (t) {
      shared = { token: t, at: now() };
      channel?.postMessage(shared);
    }
  }

  function refresh(staleToken: string | null): Promise<RefreshResult> {
    if (inflight) return inflight;

    const run = async (): Promise<RefreshResult> => {
      // تب دیگری هنگام انتظار برای قفل، توکن تازه گرفته است
      if (shared && token && token !== staleToken && now() - shared.at < freshWindowMs) return { status: "ok", token };

      let res: Response;
      try {
        res = await fetchImpl(`${base}/auth/refresh`, { method: "POST", credentials: "include", headers: { [CSRF_HEADER]: "1" } });
      } catch {
        return { status: "error" };
      }
      if (res.status === 401 || res.status === 403) {
        token = null;
        shared = null;
        return { status: "denied" };
      }
      if (!res.ok) return { status: "error" };
      const j = (await res.json()) as { accessToken: string };
      setToken(j.accessToken);
      return { status: "ok", token: j.accessToken };
    };

    inflight = (locks ? locks.request("nb-refresh", run) : run()).finally(() => {
      inflight = null;
    });
    return inflight;
  }

  async function request<T>(path: string, o: RequestOptions = {}, retried = false): Promise<T> {
    const useAuth = o.auth !== false;
    const sentToken = token;
    const headers: Record<string, string> = { Accept: "application/json", ...(o.headers ?? {}) };
    if (o.body !== undefined) headers["Content-Type"] = "application/json";
    if (useAuth && sentToken) headers["Authorization"] = `Bearer ${sentToken}`;

    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method: o.method ?? "GET",
        headers,
        body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
        credentials: "include",
      });
    } catch {
      throw new ApiError(0, "network");
    }

    if (res.status === 401 && useAuth && !retried) {
      const r = await refresh(sentToken);
      if (r.status === "ok") return request<T>(path, o, true);
      if (r.status === "denied") opts.onAuthLost?.();
      throw new ApiError(401, "unauthorized");
    }

    if (res.status === 204) return undefined as T;
    let body: unknown = undefined;
    try {
      body = await res.json();
    } catch {
      /* بدنه‌ی خالی/غیر JSON */
    }
    if (!res.ok) {
      const code = (body as { error?: unknown } | undefined)?.error;
      const err = new ApiError(res.status, typeof code === "string" ? code : `http_${res.status}`, body);
      // پیشتر این خطا مثل 403 معمولی تلقیت میشد و کاربر ناخواسته خارج میشد.
      if (isMfaRequired(err)) opts.onMfaRequired?.(err);
      throw err;
    }
    return body as T;
  }

  return {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body?: unknown, o?: RequestOptions) => request<T>(path, { ...o, method: "POST", body: body ?? {} }),
    put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
    patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
    delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
    request,
    getToken: () => token,
    setToken,

    /** ورود با OTP؛ توکن را نگه می‌دارد. */
    async verifyOtp(phone: string, code: string): Promise<void> {
      const r = await request<{ accessToken: string }>("/auth/otp/verify", { method: "POST", body: { phone, code }, auth: false });
      setToken(r.accessToken);
    },

    /**
     * برای کلاینت‌های جانبی که خودشان fetch می‌کنند (SSE اعلان‌ها): پس از 401 با «توکن قدیمی»، یک refresh ی
     * single-flight/قفل‌شده (همان مسیر request) انجام می‌دهد. اگر تب دیگری توکن تازه گرفته باشد، refresh ی اضافه نمی‌زند.
     */
    async refreshAfter401(stale: string | null): Promise<"ok" | "denied" | "error"> {
      const r = await refresh(stale);
      if (r.status === "denied") opts.onAuthLost?.();
      return r.status;
    },

    /** بازیابی نشست هنگام بارگذاری صفحه از روی کوکی refresh. «error» = خطای موقت (کاربر خارج نمی‌شود). */
    async bootstrap(): Promise<"ok" | "denied" | "error"> {
      const r = await refresh(null);
      return r.status;
    },

    async logout(): Promise<void> {
      try {
        await request<void>("/auth/logout", { method: "POST", body: {}, auth: false, headers: { [CSRF_HEADER]: "1" } });
      } finally {
        token = null;
        shared = null;
        channel?.postMessage({ logout: true });
      }
    },
  };
}

export type Api = ReturnType<typeof createApi>;

/** نمونه‌ی مشترک برنامه (سمت مرورگر). */
export function createBrowserApi(onAuthLost: () => void, onMfaRequired?: (err: ApiError) => void): Api {
  if (typeof window === "undefined") return createApi({ onAuthLost, onMfaRequired }); // SSR: بدون قفل/کانال
  const locks = typeof navigator !== "undefined" && "locks" in navigator ? (navigator.locks as unknown as LocksLike) : null;
  const channel = typeof BroadcastChannel !== "undefined" ? (new BroadcastChannel("nb-auth") as unknown as ChannelLike) : null;
  return createApi({ locks, channel, onAuthLost, onMfaRequired });
}
