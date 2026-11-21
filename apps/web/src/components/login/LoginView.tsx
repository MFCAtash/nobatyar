import type { FormEvent } from "react";
import { ErrorBox } from "@/components/ui";
import { Field } from "@/components/kit";
import { formatCountdown, formatDigits, toPersianDigits } from "@/lib/format";
import { OTP_LENGTH } from "@/lib/otp";

export interface LoginViewProps {
  step: "phone" | "code";
  phone: string;
  code: string;
  busy: boolean;
  error: string | null;
  /** ثانیه‌ی باقی‌مانده تا ارسال مجدد */
  wait: number;
  onPhone: (v: string) => void;
  onCode: (v: string) => void;
  onRequest: (e?: FormEvent) => void;
  onVerify: (e: FormEvent) => void;
  onEditPhone: () => void;
}

export function LoginView(p: LoginViewProps) {
  return (
    <div className="card stack mw-xs mx-auto mt-10 mb-10">
      <h1 className="fs-xl">ورود یا ثبت‌نام</h1>
      {p.step === "phone" ? (
        <form className="stack" onSubmit={p.onRequest} noValidate>
          <Field label="شماره‌ی موبایل" hint="کد تأیید به این شماره پیامک می‌شود. نیازی به رمز عبور نیست." error={p.error}>
            {(f) => <input className="input ltr" inputMode="tel" autoComplete="tel" placeholder="09121234567" value={p.phone} onChange={(e) => p.onPhone(e.target.value)} autoFocus {...f} />}
          </Field>
          <button className="btn btn-primary btn-block" disabled={p.busy}>{p.busy ? "در حال ارسال…" : "دریافت کد تأیید"}</button>
        </form>
      ) : (
        <form className="stack" onSubmit={p.onVerify} noValidate>
          <Field label={`کد ${formatDigits(OTP_LENGTH)} رقمی ارسال‌شده به ${toPersianDigits(p.phone)}`} error={p.error}>
            {(f) => (
              <input className="input otp" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" maxLength={8} value={p.code}
                onChange={(e) => p.onCode(e.target.value)} autoFocus {...f} />
            )}
          </Field>
          <button className="btn btn-primary btn-block" disabled={p.busy}>{p.busy ? "در حال بررسی…" : "ورود"}</button>
          <div className="row between small">
            <button type="button" className="btn btn-ghost btn-sm" onClick={p.onEditPhone}>ویرایش شماره</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={p.wait > 0 || p.busy} onClick={() => p.onRequest()}>
              {p.wait > 0 ? <>ارسال مجدد تا <span className="num">{formatCountdown(p.wait)}</span></> : "ارسال مجدد کد"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
