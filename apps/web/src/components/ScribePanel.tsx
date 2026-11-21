"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, Stepper } from "@/components/design";
import { useToast } from "@/components/Toast";
import { ErrorBox } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/messages";
import type { ScribeDraft, ScribeStatus } from "@/lib/types";

const ERROR_FA: Record<string, string> = {
  scribe_consent_required: "رضایت صریح پزشک یا بیمار فعال نیست؛ ابتدا رضایت را ثبت کنید.",
  scribe_already_started: "یک جلسهٔ دستیار بالینی برای این نوبت آغاز شده است.",
  scribe_expired: "عمر متن موقت به پایان رسیده است؛ جلسهٔ جدیدی آغاز کنید.",
  transcript_missing: "ابتدا متن گفتار را ذخیره کنید.",
  scribe_no_draft: "پیشنویسی برای انتقال وجود ندارد.",
  concurrent_modification: "یادداشت SOAP همزمان توسط پزشک ویرایش شده است؛ دوباره تلاش کنید.",
};
const errText = (e: unknown) => {
  const code = (e as ApiError).code;
  return ERROR_FA[code] ?? errorMessage(e);
};

interface ConsentState { doctor: boolean; patient: boolean; canStart: boolean }

/**
 * دستیار بالینی Ambient — رضایت صریح دوطرفه در سرور بررسی میشود.
 * متن گفتار درDB رمزنگاری و پس از TTL حذف میشود؛ خروجی فقط پیشنویس است و هرگز خودکار امضا نمیشود.
 */
export function ScribePanel({ appointmentId, disabled, soapVersion, onApply }: {
  appointmentId: string; disabled?: boolean; soapVersion?: number; onApply: (d: ScribeDraft) => void;
}) {
  const { api } = useAuth();
  const toast = useToast();
  const [state, setState] = useState<ScribeStatus | null>(null);
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([
        api.get<ScribeStatus>(`/appointments/${appointmentId}/scribe`),
        api.get<ConsentState>(`/appointments/${appointmentId}/scribe/consents`),
      ]);
      setState(s); setConsent(c);
    } catch (e) { setErr(errText(e)); }
  }, [api, appointmentId]);
  useEffect(() => { void load(); }, [load]);

  const act = async (path: string, body?: unknown) => {
    setBusy(true); setErr(null);
    try {
      await api.post<Record<string, unknown>>(path, body);
      toast("عملیات انجام شد", "ok");
      await load();
    } catch (e) { setErr(errText(e)); }
    finally { setBusy(false); }
  };

  const generate = async () => {
    setBusy(true); setErr(null);
    try {
      const draft = await api.post<ScribeDraft>("/draft");
      setState({ status: "DRAFT_GENERATED", draft });
      onApply(draft);
      toast("پیشنویس در فرم SOAP قرار گرفت؛ بازبینی شما الزامی است", "ok");
    } catch (e) { setErr(errText(e)); }
    finally { setBusy(false); }
  };

  const apply = async () => {
    setBusy(true); setErr(null);
    try {
      await api.post("/apply", { ...(soapVersion ? { expectedVersion: soapVersion } : {}) });
      toast("پیشنویس به SOAP منتقل شد (هنوز امضا نشده)", "ok");
      await load();
    } catch (e) { setErr(errText(e)); }
    finally { setBusy(false); }
  };

  const discard = async () => {
    setBusy(true); setErr(null);
    try {
      await api.delete(`/appointments/${appointmentId}/scribe`);
      toast("متن موقت و پیشنویس حذف شد", "ok");
      setState({ status: "DISCARDED", draft: null });
    } catch (e) { setErr(errText(e)); }
    finally { setBusy(false); }
  };

  const started = state && state.status !== "NOT_STARTED" && state.status !== "EXPIRED" && state.status !== "DISCARDED";
  const stepIndex = !started ? 0 : state?.draft ? 3 : state?.status === "TRANSCRIPT_READY" ? 2 : 1;

  return (
    <section className="card stack" aria-label="دستیار بالینی">
      <div className="row between">
        <h2 className="fs-lg m-0">دستیار بالینی Ambient (AI Scribe)</h2>
        {state && <span className="badge">{state.status}</span>}
      </div>
      <Stepper steps={["رضایت", "متن گفتار", "پیشنویس", "بازبینی پزشک"]} current={stepIndex} />
      <ErrorBox message={err} />
      <Alert tone="warn" title="نامها بهطور خودکار پاک نمیشوند">
        شماره تلفن، کد ملی و ایمیل پاکسازی میشوند، ولی نام افراد توسط الگو تشخیص داده نمیشود؛ بازبینی پزشک اجباری است.
      </Alert>
      <ul className="ds-consent-list">
        <li>رضایت پزشک: {consent?.doctor ? "✅ فعال" : "❌ ثبت نشده"}</li>
        <li>رضایت بیمار: {consent?.patient ? "✅ فعال" : "❌ ثبت نشده"}</li>
      </ul>
      {disabled ? (
        <p className="muted">پس از امضای SOAP، دستیار بالینی قابل استفاده نیست.</p>
      ) : (
        <>
          {!started && (
            <button className="btn btn-primary self-start" disabled={busy || !consent?.canStart} type="button" onClick={() => void act("/start")}>
              شروع با رضایت دوطرفه
            </button>
          )}
          {started && (
            <>
              <label>متن گفتار ویزیت (پس از تبدیل صوت به متن)
                <textarea className="textarea" rows={5} maxLength={30000} value={text} onChange={(e) => setText(e.target.value)} placeholder="متن تبدیلشده گفتار را اینجا قرار دهید" />
              </label>
              <div className="row gap-2 wrap">
                <button className="btn" disabled={busy || text.trim().length < 20} type="button" onClick={() => void act("/transcript", { transcript: text })}>ذخیره متن موقت</button>
                <button className="btn btn-primary" disabled={busy} type="button" onClick={() => void generate()}>ساخت پیشنویس SOAP</button>
                {state?.draft && <button className="btn" disabled={busy} type="button" onClick={() => onApply(state.draft!)}>بارگذاری مجدد پیشنویس در فرم</button>}
                {state?.draft && <button className="btn" disabled={busy} type="button" onClick={() => void apply()}>انتقال به SOAP (پیشنویس)</button>}
                <button className="btn ghost" disabled={busy} type="button" onClick={() => void discard()}>پاکسازی فوری</button>
              </div>
              <p className="help">متن موقت حداکثر ۱۵ دقیقه نگهداری میشود؛ پاکسازی فوری آن را بلافاصله حذف میکند.</p>
            </>
          )}
        </>
      )}
    </section>
  );
}
