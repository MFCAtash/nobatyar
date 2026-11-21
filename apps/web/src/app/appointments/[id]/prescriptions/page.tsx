"use client";
import { formatDigits } from "@/lib/format";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PrescriptionCard } from "@/components/PrescriptionCard";
import { RequireAuth } from "@/components/RequireAuth";
import { useToast } from "@/components/Toast";
import { ErrorBox, Loading } from "@/components/ui";
import { RX_FORM_FA } from "@/lib/clinical";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/messages";
import { AllergyBanner } from "@/components/AllergyBanner";
import type { AllergyWarning, Prescription, RxItem } from "@/lib/types";

const blank = (): RxItem & { durationDays: number; quantity: number } => ({ drugName: "", form: "TABLET", strength: "", dose: "", frequency: "", durationDays: 5, quantity: 10, instructions: "" });

function Page() {
  const { id } = useParams<{ id: string }>();
  const { api, me } = useAuth();
  const toast = useToast();
  const isDoctor = me?.role === "DOCTOR";
  const [list, setList] = useState<Prescription[] | null>(null);
  const [items, setItems] = useState<RxItem[]>([blank()]);
  const [validDays, setValidDays] = useState("30");
  const [warnings, setWarnings] = useState<AllergyWarning[] | null>(null);
  const [ack, setAck] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get<Prescription[]>(`/appointments/${id}/prescriptions`).then(setList).catch((e) => setErr(errorMessage(e))), [api, id]);
  useEffect(() => { void load(); }, [load]);

  async function issue() {
    setBusy(true); setErr(null);
    try {
      const clean = items.map((i) => ({ ...i, strength: i.strength || undefined, instructions: i.instructions || undefined }));
      await api.post(`/appointments/${id}/prescriptions`, { items: clean, validDays: Number(validDays) || 30, acknowledgeWarnings: ack });
      toast("نسخه صادر شد.", "ok"); setItems([blank()]); setWarnings(null); setAck(false); await load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "allergy_warning") { setWarnings((e.body as { warnings: AllergyWarning[] }).warnings); setErr(null); }
      else setErr(errorMessage(e));
    } finally { setBusy(false); }
  }
  const upd = (i: number, p: Partial<RxItem>) => { setItems((xs) => xs.map((x, j) => j === i ? { ...x, ...p } : x)); setWarnings(null); setAck(false); };

  if (!list) return err ? <ErrorBox message={err} /> : <Loading />;
  return (
    <div className="stack mw-2xl mx-auto">
      <div className="row between"><h1 className="fs-xl m-0">نسخه‌های این نوبت</h1><Link className="btn btn-sm btn-ghost" href={`/appointments/${id}`}>بازگشت</Link></div>
      {list.length === 0 && <div className="empty">نسخه‌ای ثبت نشده است.</div>}
      {list.map((p) => <PrescriptionCard key={p.id} p={p} canCancel={isDoctor} onChanged={() => void load()} />)}

      {isDoctor && (
        <div className="card stack">
          <h3>نسخه‌ی جدید</h3>
          <p className="help">نسخه‌ی صادرشده قابل ویرایش نیست؛ برای اصلاح، آن را باطل و دوباره صادر کنید.</p>
          <AllergyBanner appointmentId={id} showLists={false} />
          <p className="help">بررسی خودکار حساسیت فقط چند گروه دارویی و نام‌های رایج را می‌شناسد؛ نبودن هشدار به معنای ایمن‌بودن نیست و جایگزین بررسی پزشک نیست.</p>
          {items.map((it, i) => (
            <fieldset key={i} className="stack rx-item">
              <legend className="small muted">قلم {formatDigits(i + 1)}</legend>
              <div className="grid grid-2">
                <div className="field"><label className="label" htmlFor={`dn${i}`}>نام دارو</label><input id={`dn${i}`} className="input" value={it.drugName} maxLength={120} onChange={(e) => upd(i, { drugName: e.target.value })} /></div>
                <div className="field"><label className="label" htmlFor={`fm${i}`}>شکل دارویی</label>
                  <select id={`fm${i}`} className="input" value={it.form} onChange={(e) => upd(i, { form: e.target.value })}>{Object.entries(RX_FORM_FA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
                <div className="field"><label className="label" htmlFor={`st${i}`}>غلظت (مثلاً ۵۰۰ mg)</label><input id={`st${i}`} className="input ltr" value={it.strength} maxLength={40} onChange={(e) => upd(i, { strength: e.target.value })} /></div>
                <div className="field"><label className="label" htmlFor={`ds${i}`}>دوز هر نوبت</label><input id={`ds${i}`} className="input" value={it.dose} maxLength={60} onChange={(e) => upd(i, { dose: e.target.value })} /></div>
                <div className="field"><label className="label" htmlFor={`fq${i}`}>دفعات مصرف</label><input id={`fq${i}`} className="input" value={it.frequency} maxLength={60} onChange={(e) => upd(i, { frequency: e.target.value })} /></div>
                <div className="grid grid-2">
                  <div className="field"><label className="label" htmlFor={`du${i}`}>مدت (روز)</label><input id={`du${i}`} className="input ltr" inputMode="numeric" value={it.durationDays} onChange={(e) => upd(i, { durationDays: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></div>
                  <div className="field"><label className="label" htmlFor={`qt${i}`}>تعداد</label><input id={`qt${i}`} className="input ltr" inputMode="numeric" value={it.quantity} onChange={(e) => upd(i, { quantity: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></div>
                </div>
              </div>
              <div className="field"><label className="label" htmlFor={`in${i}`}>توضیحات مصرف</label><input id={`in${i}`} className="input" maxLength={300} value={it.instructions} onChange={(e) => upd(i, { instructions: e.target.value })} /></div>
              {items.length > 1 && <button className="btn btn-sm btn-ghost self-start" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>حذف قلم</button>}
            </fieldset>
          ))}
          {items.length < 10 && <button className="btn btn-sm self-start" onClick={() => setItems((xs) => [...xs, blank()])}>+ قلم دارویی</button>}
          <div className="field mw-field"><label className="label" htmlFor="vd">اعتبار نسخه (روز، حداکثر ۹۰)</label><input id="vd" className="input ltr" inputMode="numeric" value={validDays} onChange={(e) => setValidDays(e.target.value.replace(/\D/g, "").slice(0, 2))} /></div>

          {warnings && (
            <div className="error-box" role="alert">
              <strong>هشدار حساسیت دارویی</strong>
              <ul className="list-inset mt-2 mb-2 m-0">{warnings.map((w, i) => <li key={i}>{w.drugName} ↔ «{w.allergen}»: {w.reasonFa}</li>)}</ul>
              <label className="check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> هشدارها را بررسی کردم و با مسئولیت خودم صدور را تأیید می‌کنم.</label>
            </div>
          )}
          <ErrorBox message={err} />
          <button className="btn btn-primary" disabled={busy || (warnings !== null && !ack)} onClick={() => void issue()}>صدور نسخه</button>
        </div>
      )}
    </div>
  );
}
export default function PrescriptionsOfAppointment() { return <RequireAuth roles={["PATIENT", "DOCTOR"]}><Page /></RequireAuth>; }
