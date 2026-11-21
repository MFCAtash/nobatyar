"use client";
import { useEffect } from "react";

/** ثبت Service Worker (فقط production؛ در dev با HMR تداخل دارد). SW فقط فایل‌های استاتیک را cache می‌کند (public/sw-policy.js). */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_PWA_DEV !== "true") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
  }, []);
  return null;
}
