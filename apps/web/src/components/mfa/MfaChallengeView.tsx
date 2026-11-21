import type { FormEvent } from "react";
import { ErrorBox } from "@/components/ui";
import { Field } from "@/components/kit";

export function MfaChallengeView(p: {
  code: string;
  busy: boolean;
  error: string | null;
  onCode: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <div className="card stack mw-xs mx-auto mt-10 mb-10">
      <h1 className="fs-xl">تأیید دومرحلهای</h1>
      <p className="muted small m-0">برای دسترسی به بخش مدیریت، کد شش رقمی برنامه احراز هویت یا یکی از کدهای پشتیبان را وارد کنید.</p>
      <form className="stack" onSubmit={p.onSubmit} noValidate>
        <Field label="کد تأیید" error={p.error} hint="کد پشتیبان به شکل ABCD-1234-EF56 است و فقط یکبار قابل استفاده است.">
          {(f) => (
            <input className="input ltr" inputMode="text" autoComplete="one-time-code" maxLength={14}
              placeholder="000000" value={p.code} onChange={(e) => p.onCode(e.target.value)} autoFocus {...f} />
          )}
        </Field>
        <button className="btn btn-primary btn-block" disabled={p.busy}>{p.busy ? "در حال بررسی…" : "تأیید و ادامه"}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={p.onCancel}>خروج از حساب</button>
      </form>
      {p.error && <ErrorBox message={p.error} />}
    </div>
  );
}
