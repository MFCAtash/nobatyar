"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { safeNext, toAsciiDigits } from "@/lib/format";
import { errorMessage } from "@/lib/messages";
import { isCompleteOtp, normalizeOtp, resendSeconds } from "@/lib/otp";
import { useCountdown } from "@/lib/use-countdown";
import { useWebOtp } from "@/lib/use-web-otp";
import { LoginView } from "./LoginView";

const RESEND_SEC = 60;
const PHONE_RE = /^(\+?98|0)?9\d{9}$/;

export function LoginContainer() {
  const { api, login, status, me } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"), "");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { left: wait, start: startWait } = useCountdown();
  const submitted = useRef<string>(""); // جلوگیری از ارسال خودکارِ دوباره‌ی همان کد

  // تنها منبع ریدایرکت پس از ورود (هم برای کاربر واردشده‌ی قبلی، هم بعد از verify)
  useEffect(() => {
    if (status !== "authed" || !me) return;
    if (!me.fullName) return router.replace(`/onboarding${next ? `?next=${encodeURIComponent(next)}` : ""}`);
    router.replace(next || (me.role === "DOCTOR" ? "/doctor" : me.role === "ADMIN" ? "/admin/verifications" : "/"));
  }, [status, me, next, router]);

  async function requestCode(e?: FormEvent) {
    e?.preventDefault();
    const p = toAsciiDigits(phone).replace(/\s+/g, "");
    if (!PHONE_RE.test(p)) return setErr("شماره‌ی موبایل معتبر نیست (مثال: ۰۹۱۲۱۲۳۴۵۶۷).");
    setBusy(true); setErr(null);
    try {
      await api.post("/auth/otp/request", { phone: p }, { auth: false });
      setStep("code"); startWait(RESEND_SEC); submitted.current = "";
    } catch (e2) {
      if (e2 instanceof ApiError && e2.retryAfterSec) { startWait(resendSeconds(e2.retryAfterSec)); if (e2.code === "too_many_requests") setStep("code"); }
      setErr(errorMessage(e2));
    } finally { setBusy(false); }
  }

  async function verifyWith(raw: string) {
    const c = normalizeOtp(raw);
    if (!/^\d{6,8}$/.test(c)) return setErr("کد تأیید را کامل وارد کنید.");
    setBusy(true); setErr(null);
    try { await login(toAsciiDigits(phone).replace(/\s+/g, ""), c); } // ریدایرکت را effect بالا انجام می‌دهد
    catch (e2) { setErr(errorMessage(e2)); setCode(""); submitted.current = ""; } finally { setBusy(false); }
  }

  const onCode = (v: string) => {
    const c = normalizeOtp(v);
    setCode(c);
    // ارسال خودکار به‌محض کامل شدن کد (چسباندن، autofill iOS، WebOTP)
    if (isCompleteOtp(c) && !busy && submitted.current !== c) { submitted.current = c; void verifyWith(c); }
  };
  useWebOtp(step === "code", onCode);

  return (
    <LoginView
      step={step} phone={phone} code={code} busy={busy} error={err} wait={wait}
      onPhone={setPhone} onCode={onCode} onRequest={(e) => void requestCode(e)}
      onVerify={(e) => { e.preventDefault(); void verifyWith(code); }}
      onEditPhone={() => { setStep("phone"); setCode(""); setErr(null); }}
    />
  );
}
