"use client";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import type { Role } from "@/lib/types";
import { Loading } from "./ui";

/** محافظ مسیر در سمت کلاینت (UX). امنیت واقعی با Guard/RLS در API است. */
export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { status, me, mfaRequired, retry } = useAuth();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (status === "anon") router.replace(`/login?next=${encodeURIComponent(path)}`);
    else if (mfaRequired) router.replace(`/mfa?next=${encodeURIComponent(path)}`);
  }, [status, mfaRequired, router, path]);

  if (status === "error") {
    return (
      <div className="empty stack" role="alert">
        <span>اتصال برقرار نشد. اینترنت خود را بررسی کنید.</span>
        <button className="btn btn-sm" onClick={retry}>تلاش دوباره</button>
      </div>
    );
  }
  if (mfaRequired) return <Loading />;
  if (status !== "authed" || !me) return <Loading />;
  if (roles && !roles.includes(me.role)) return <div className="empty">دسترسی به این بخش برای حساب شما مجاز نیست.</div>;
  return <>{children}</>;
}
