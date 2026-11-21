"use client";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Api, ApiError, createBrowserApi } from "./api";
import type { Me } from "./types";

type Status = "loading" | "anon" | "authed" | "error";
interface AuthValue {
  status: Status;
  me: Me | null;
  api: Api;
  /** پس از verifyOtp صدا زده می‌شود */
  login: (phone: string, code: string) => Promise<Me>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<Me | null>;
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
  const [state, setState] = useState<{ status: Status; me: Me | null }>({ status: "loading", me: null });
  const apiRef = useRef<Api | null>(null);
  if (!apiRef.current) apiRef.current = createBrowserApi(() => setState({ status: "anon", me: null }));
  const api = apiRef.current;

  const refreshMe = useCallback(async (): Promise<Me | null> => {
    try {
      const me = await api.get<Me>("/me");
      setState({ status: "authed", me });
      return me;
    } catch (e) {
      // فقط رد صریح نشست یعنی «خارج‌شده»؛ خطای موقت شبکه/سرور کاربر را بیرون نمی‌اندازد
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setState({ status: "anon", me: null });
      else setState((s) => (s.me ? s : { status: "error", me: null }));
      return null;
    }
  }, [api]);

  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setState({ status: "loading", me: null });
    setAttempt((n) => n + 1);
  }, []);

  // بازیابی نشست از کوکی refresh (در StrictMode دوبار صدا زده می‌شود؛ api آن را single-flight می‌کند)
  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await api.bootstrap();
      if (!alive) return;
      if (r === "denied") return setState({ status: "anon", me: null });
      if (r === "error") return setState({ status: "error", me: null });
      await refreshMe();
    })();
    return () => { alive = false; };
  }, [api, refreshMe, attempt]);

  const login = useCallback(async (phone: string, code: string) => {
    await api.verifyOtp(phone, code);
    const me = await api.get<Me>("/me");
    setState({ status: "authed", me });
    return me;
  }, [api]);

  const logout = useCallback(async () => {
    try { await api.logout(); } catch { /* حتی با خطای شبکه محلی خارج می‌شویم */ }
    setState({ status: "anon", me: null });
  }, [api]);

  const value = useMemo(() => ({ ...state, api, login, logout, refreshMe, retry }), [state, api, login, logout, refreshMe, retry]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
