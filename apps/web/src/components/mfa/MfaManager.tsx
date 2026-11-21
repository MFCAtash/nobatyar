"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/design";
import { useToast } from "@/components/Toast";
import { ErrorBox, Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/messages";
import type { MfaEnroll, MfaStatus } from "@/lib/types";

/**
 * مدیریت کامل TOTP: enroll، نمایش یکبارهٔ راز/کدهای پشتیبان، تأیید، step-up، چرخش و غیرفعالسازی.
 * هم در صفحهٔ امنیت عمومی و هم در صفحهٔ ادمین استفاده میشود.
 */
export function MfaManager({ title = "امنیت حساب" }: { title?: string }) {
  const { api } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [enroll, setEnroll] = useState<MfaEnroll | null>(null);
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState("");
  const [rotateCode, setRotateCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setStatus(await api.get<MfaStatus>("/me/mfa")); }
    catch (e) { setErr(errorMessage(e)); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  const act = async (path: string, body?: unknown, onOk?: (r: unknown) => void) => {
    setBusy(true); setErr(null);
    try {
      const r = await api.post<{ accessToken?: string } & Record<string, unknown>>(path, body);
      if (typeof r?.accessToken === "string") api.setToken(r.accessToken);
      onOk?.(r);
      toast("عملیات با موفقیت انجام شد", "ok");
      await load();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  };

  if (!status) return <Loading />;

  return (
    <div className="stack">
      <header className="page-head">
        <div><h1>{title}</h1><p className="muted">احراز هویت دومرحلهای TOTP و کدهای پشتیبان</p></div>
      </header>
      <ErrorBox message={err} />

      <section className="card">
        <div className="row between">
          <div>
            <h2 className="fs-lg m-0">وضعیت MFA</h2>
            <p className="muted">{status.enabled ? `فعال از ${status.enrolledAt ? formatDateTime(status.enrolledAt) : "—"}` : "غیرفعال"}</p>
          </div>
          <span className={`badge ${status.enabled ? "status-ok" : "status-bad"}`}>{status.enabled ? "فعال" : "غیرفعال"}</span>
        </div>
        {status.required && !status.enabled && (
          <p className="note-box">سیاست سامانه ادمینها را ملزم به MFA میکند؛ تا زمان فعالسازی، دسترسی به مسیرهای ادمین مسدود است.</p>
        )}
        <p className="muted small">کدهای پشتیبان باقیمانده: {status.recoveryCodesLeft}</p>
        {!status.enabled && (
          <button className="btn btn-primary" disabled={busy} type="button" onClick={() => void act("/me/mfa/enroll", undefined, (r) => setEnroll(r as MfaEnroll))}>
            شروع ثبت TOTP
          </button>
        )}
      </section>

      {enroll && (
        <section className="card mt-4">
          <h2 className="fs-lg">راز TOTP (فقط همین بار نمایش داده میشود)</h2>
          <ol>
            <li>
              راز را در Authenticator وارد کنید:{" "}
              <code className="num">{reveal ? enroll.secret : "••••••••••••••••••••"}</code>
              <button className="btn btn-sm self-start" type="button" onClick={() => setReveal((v) => !v)}>{reveal ? "پنهان" : "نمایش"}</button>
              <button className="btn btn-sm self-start" type="button" onClick={async () => {
                try { await navigator.clipboard.writeText(enroll.secret); setCopied(true); } catch { setCopied(false); }
              }}>{copied ? "کپی شد" : "کپی"}</button>
              <a className="btn btn-sm self-start" href={enroll.uri}>افزودن به Authenticator</a>
            </li>
            <li>کدهای پشتیبان را در جای امن ذخیره کنید؛ هر کد فقط یکبار قابل استفاده است:</li>
          </ol>
          <Alert tone="bad" title="راز خود را هرگز به اشتراک نگذارید">پشتیبان فنی هرگز از شما کد یا راز TOTP نمیخواهد.</Alert>
          <div className="row gap-2 wrap">{enroll.recoveryCodes.map((c) => <code key={c} className="badge">{c}</code>)}</div>
          <button className="btn btn-sm self-start" type="button" onClick={() => {
            const blob = new Blob([enroll.recoveryCodes.join("\n")], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = "nobatyar-mfa-recovery.txt"; a.click();
            URL.revokeObjectURL(url);
          }}>دانلود کدهای پشتیبان</button>
          <div className="row gap-2 wrap mt-3">
            <label>کد ۶ رقمی برنامه
              <input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
            <button className="btn btn-primary" disabled={busy || code.length !== 6} type="button" onClick={() => void act("/me/mfa/enable", { code }, () => setEnroll(null))}>
              تأیید و فعالسازی
            </button>
          </div>
        </section>
      )}

      {status.enabled && (
        <section className="card mt-4">
          <h2 className="fs-lg">تأیید مجدد (Step-up)</h2>
          <p className="muted small">کد TOTP یا کد پشتیبان تکبارمصرف را وارد کنید؛ در صورت نیاز access token تازه صادر میشود.</p>
          <div className="row gap-2 wrap">
            <label>کد TOTP یا کد پشتیبان
              <input value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
            <button className="btn" disabled={busy || !code} type="button" onClick={() => void act("/auth/mfa/verify", { code })}>تأیید</button>
            <button className="btn ghost" disabled={busy || !code || status.required} type="button" onClick={() => void act("/me/mfa/disable", { code })}>غیرفعالسازی</button>
          </div>
        </section>
      )}

      {status.enabled && (
        <section className="card mt-4">
          <h2 className="fs-lg">چرخش راز</h2>
          <p className="muted small">چرخش تنها با کد فعلی مجاز است و وضعیت فعال باقی میماند.</p>
          <div className="row gap-2 wrap">
            <label>کد فعلی TOTP
              <input inputMode="numeric" maxLength={6} value={rotateCode} onChange={(e) => setRotateCode(e.target.value)} />
            </label>
            <button className="btn" disabled={busy || rotateCode.length !== 6} type="button" onClick={() => void act("/me/mfa/rotate", { code: rotateCode }, (r) => {
              setEnroll(r as MfaEnroll); setReveal(false); setRotateCode("");
            })}>چرخش راز</button>
          </div>
        </section>
      )}
    </div>
  );
}
