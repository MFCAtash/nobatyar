"use client";
import { MfaManager } from "@/components/mfa/MfaManager";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";

function AdminSecurity() {
  const { me } = useAuth();
  if (me?.role !== "ADMIN") return <div className="empty">دسترسی فقط برای ادمین است.</div>;
  return <MfaManager title="امنیت حساب ادمین" />;
}

export default function SecurityPage() {
  return <RequireAuth roles={["ADMIN"]}><AdminSecurity /></RequireAuth>;
}
