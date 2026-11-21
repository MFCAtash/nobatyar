"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";

interface DemoConfig { enabled: boolean; role: string | null }
interface DemoLogin { accessToken: string; role: string }

/**
 * ورود خودکار محیط نمایش: فقط زمانی که بکاند صریحاً DEMO_AUTOLOGIN=true اعلام کند.
 * از همان جریان نشست/JWT استاندارد استفاده میکند و در production توسط بکاند مسدود است.
 */
export function DemoAutoLogin() {
  const { status, api, refreshMe } = useAuth();
  const tried = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // مرورگرهای اتوماتیک (Playwright) نباید بهصورت دمو وارد شوند؛ جریان OTP را تست میکنند.
    if (typeof navigator !== "undefined" && (navigator as Navigator & { webdriver?: boolean }).webdriver === true) return;
    if (tried.current || status === "loading" || status === "authed") return;
    tried.current = true;
    void (async () => {
      try {
        const cfg = await api.get<DemoConfig>("/demo/config");
        if (!cfg.enabled) return;
        const tokens = await api.post<DemoLogin>("/demo/login", {}, { auth: false });
        api.setToken(tokens.accessToken);
        await refreshMe();
      } catch (e) {
        setError(e instanceof Error ? e.message : "demo login failed");
      }
    })();
  }, [status, api, refreshMe]);

  if (!error) return null;
  return <div className="demo-login-error" role="status">ورود دمو در دسترس نیست: {error}</div>;
}
