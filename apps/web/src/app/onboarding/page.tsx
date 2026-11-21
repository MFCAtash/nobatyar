"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { CONSENT_VERSION } from "@/components/ConsentDialog";
import { RequireAuth } from "@/components/RequireAuth";
import { ErrorBox } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { safeNext } from "@/lib/format";
import { errorMessage } from "@/lib/messages";

function Form() {
  const { api, refreshMe } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"), "/");
  const [name, setName] = useState("");
  const [terms, setTerms] = useState(false);
  const [health, setHealth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setErr("نام و نام خانوادگی را وارد کنید.");
    setBusy(true); setErr(null);
    try {
      await api.patch("/me/profile", { fullName: name.trim() });
      await api.post("/me/consents", { type: "TERMS", version: CONSENT_VERSION });
      await api.post("/me/consents", { type: "PRIVACY_POLICY", version: CONSENT_VERSION });
      if (health) await api.post("/me/consents", { type: "HEALTH_DATA_PROCESSING", version: CONSENT_VERSION });
      await refreshMe();
      router.replace(next);
    } catch (e2) { setErr(errorMessage(e2)); } finally { setBusy(false); }
  }

  return (
    <form className="card stack mw-sm mx-auto mt-8 mb-8" onSubmit={submit} noValidate>
      <h1 className="fs-xl">تکمیل ثبت‌نام</h1>
      <div className="field">
        <label className="label" htmlFor="name">نام و نام خانوادگی</label>
        <input id="name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <label className="check"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} /> قوانین و سیاست حریم خصوصی را می‌خوانم و می‌پذیرم. (الزامی)</label>
      <label className="check"><input type="checkbox" checked={health} onChange={(e) => setHealth(e.target.checked)} /> با پردازش رمزنگاری‌شده‌ی اطلاعات سلامت برای رزرو نوبت موافقم. (برای رزرو لازم است؛ بعداً هم می‌توانید بپذیرید)</label>
      <ErrorBox message={err} />
      <button className="btn btn-primary" disabled={busy || !terms}>{busy ? "در حال ذخیره…" : "ادامه"}</button>
    </form>
  );
}

export default function OnboardingPage() {
  return <RequireAuth><Suspense fallback={null}><Form /></Suspense></RequireAuth>;
}
