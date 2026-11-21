"use client";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Api, ApiError, createBrowserApi, isMfaRequired } from "./api";
import type { Me } from "./types";

type Status = "loading" | "anon" | "authed" | "error";
interface AuthValue {
  status: Status;
  me: Me | null;
  api: Api;
  /** ادمین وارد شده ولی منتظر تأیید MFA است؛ نشست باطل نشده است. */
  mfaRequired: boolean;
  /** پس از verifyOtp صدا زده میشود */
  login: (phone: string, code: string) => Promise<Me | null>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<Me | null>;
  /** تکمیل چالش TOTP/کد پشتیبان و دریافت توکن دارای claim مfa */
  completeMfa: (code: string) => Promise<void>;
  cancelMfa: () => Promise<void>;
  /** تلاش دوباره پس از خطای موقت شبکه/سرور هنگام بارگذاری */
  retry: () => void;
}

const Ctx = createContext<AuthValue | null>(null);
export const useAuth = (): AuthValue => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ status: Status; me: Me | null; mfaRequired: boolean }>({ status: "loading", me: null, mfaRequired: false });
  const apiRef = useRef<Api | null>(null);
  if (!apiRef.current) apiRef.current = createBrowserApi(
    () => setState({ status: "anon", me: null, mfaRequired: false }),
    () => setState((s) => ({ ...s, status: "authed", mfaRequired: true })),
  );
  const api = apiRef.current;

  const refreshMe = useCallback(async (): Promise<Me | null> => {
    try {
      const me = await api.get<Me>("/me");
      setState({ status: "authed", me, mfaRequired: false });
      return me;
    } catch (e) {
      // 403 mfa_required یک چالش است، نه خروج: نشست معتبر باقی میماند.
      if (isMfaRequired(e)) {
        setState((s) => ({ ...s, status: "authed", mfaRequired: true }));
        return null;
      }
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setState({ status: "anon", me: null, mfaRequired: false });
      else setState((s) => (s.me ? s : { status: "error", me: null, mfaRequired: false }));
      return null;
    }
  }, [api]);

  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setState({ status: "loading", me: null, mfaRequired: false });
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await api.bootstrap();
      if (!alive) return;
      if (r === "denied") return setState({ status: "anon", me: null, mfaRequired: false });
      if (r === "error") return setState({ status: "error", me: null, mfaRequired: false });
      await refreshMe();
    })();
    return () => { alive = false; };
  }, [api, refreshMe, attempt]);

  const login = useCallback(async (phone: string, code: string): Promise<Me | null> => {
    try {
      await api.verifyOtp(phone, code);
    } catch (e) {
      if (isMfaRequired(e)) {
        setState({ status: "authed", me: null, mfaRequired: true });
        return null;
      }
      throw e;
    }
    return refreshMe();
  }, [api, refreshMe]);

  const completeMfa = useCallback(async (code: string): Promise<void> => {
    const r = await api.post<{ accessToken: string }>("/auth/mfa/verify", { code });
    api.setToken(r.accessToken);
    setState((s) => ({ ...s, mfaRequired: false }));
    await refreshMe();
  }, [api, refreshMe]);

  const cancelMfa = useCallback(async (): Promise<void> => {
    try { await api.logout(); } catch { /* خروج محلی حتی با خطای شبکه */ }
    setState({ status: "anon", me: null, mfaRequired: false });
  }, [api]);

  const logout = useCallback(async () => {
    try { await api.logout(); } catch { /* حتی با خطای شبکه محلی خارج میشویم */ }
    setState({ status: "anon", me: null, mfaRequired: false });
  }, [api]);

  const value = useMemo(
    () => ({ ...state, api, login, logout, refreshMe, completeMfa, cancelMfa, retry }),
    [state, api, login, logout, refreshMe, completeMfa, cancelMfa, retry],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
