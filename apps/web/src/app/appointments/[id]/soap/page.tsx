"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useToast } from "@/components/Toast";
import { ErrorBox, Loading, Modal } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/messages";
import { AllergyBanner } from "@/components/AllergyBanner";
import { ScribePanel } from "@/components/ScribePanel";
import type { Diagnosis, SoapView, ScribeDraft } from "@/lib/types";

const EMPTY = { subjective: "", objective: "", assessment: "", plan: "", patientSummary: "", followUpDays: "", diagnoses: [] as Diagnosis[] };

function Editor() {
  const { id } = useParams<{ id: string }>();
  const { api } = useAuth();
  const toast = useToast();
  const [v, setV] = useState<SoapView | null>(null);
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [addendum, setAddendum] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api.get<SoapView>(`/appointments/${id}/soap`);
      setV(r);
      if (r.exists) setF({ ...r.content, patientSummary: r.patientSummary, followUpDays: r.content.followUpDays ? String(r.content.followUpDays) : "" });
    } catch (e) { setErr(errorMessage(e)); }
  }, [api, id]);
  useEffect(() => { void load(); }, [load]);

  if (!v) return err ? <ErrorBox message={err} /> : <Loading />;
  const signed = v.exists && v.status === "SIGNED";
  const set = (k: keyof typeof EMPTY, val: string) => setF((p) => ({ ...p, [k]: val }));
  const body = () => ({
    subjective: f.subjective, objective: f.objective, assessment: f.assessment, plan: f.plan, patientSummary: f.patientSummary,
    followUpDays: f.followUpDays ? Number(f.followUpDays) : null,
    diagnoses: f.diagnoses.filter((d) => d.text.trim() || d.code?.trim()),
    ...(v.exists ? { expectedVersion: v.version } : {}),
  });

  async function save(quiet = false) {
    setBusy(true); setErr(null);
    try { await api.put(`/appointments/${id}/soap`, body()); if (!quiet) toast("پیش‌نویس ذخیره شد.", "ok"); await load(); return true; }
    catch (e) { setErr(errorMessage(e)); return false; } finally { setBusy(false); }
  }
  async function sign() {
    if (!(await save(true))) return setConfirm(false);
    setBusy(true);
    try { await api.post(`/appointments/${id}/soap/sign`); toast("یادداشت امضا شد.", "ok"); setConfirm(false); await load(); }
    catch (e) { setErr(errorMessage(e)); setConfirm(false); } finally { setBusy(false); }
  }
  async function addAddendum() {
    setBusy(true); setErr(null);
    try { await api.post(`/appointments/${id}/soap/addenda`, { body: addendum }); setAddendum(""); toast("الحاقیه ثبت شد.", "ok"); await load(); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  }

  const area = (k: "subjective" | "objective" | "assessment" | "plan", label: string, hint: string) => (
    <div className="field"><label className="label" htmlFor={k}>{label}</label>
      <textarea id={k} className="textarea" disabled={signed} maxLength={8000} value={f[k]} placeholder={hint} onChange={(e) => set(k, e.target.value)} /></div>
  );

  return (
    <div className="stack mw-2xl mx-auto">
      {!signed && (
        <ScribePanel
          appointmentId={id}
          soapVersion={v.exists ? v.version : undefined}
          onApply={(d: ScribeDraft) => setF((p) => ({
            ...p,
            subjective: d.subjective || p.subjective,
            objective: d.objective || p.objective,
            assessment: d.assessment || p.assessment,
            plan: d.plan || p.plan,
            patientSummary: d.patientSummary || p.patientSummary,
          }))}
        />
      )}
      <div className="card stack">
        <div className="row between"><h1 className="fs-xl m-0">یادداشت ویزیت (SOAP)</h1>
          <span className={`badge badge-${signed ? "ok" : "warn"}`}>{signed ? "امضا شده" : "پیش‌نویس"}</span></div>
        <div className="row"><Link href={`/appointments/${id}`} className="btn btn-sm btn-ghost">بازگشت به نوبت</Link><Link href={`/appointments/${id}/prescriptions`} className="btn btn-sm">نسخه‌ها</Link></div>
        <div className="row gap-2 wrap">
          <label>قالب SOAP
            <select className="select" defaultValue="" onChange={(e) => {
              const t = e.target.value;
              if (!t) return;
              const presets: Record<string, Partial<typeof EMPTY>> = {
                routine: { subjective: "بیمار با شکایت اصلی مراجعه کرد.", objective: "علائم حیاتی پایدار؛ معاینه عمومی بدون یافته خاص.", assessment: "وضعیت بالینی پایدار.", plan: "پیگیری در صورت تشدید علائم." },
                followup: { subjective: "بیمار برای پیگیری ویزیت قبلی مراجعه کرد.", objective: "بهبود نسبی علائم ثبت شد.", assessment: "پاسخ مناسب به درمان قبلی.", plan: "ادامه درمان و ویزیت بعدی طبق برنامه." },
                acute: { subjective: "شروع ناگهانی علائم از دیروز.", objective: "معاینه بالینی محدود؛ علائم حیاتی ثبت شد.", assessment: "نیاز به بررسی بیشتر.", plan: "آزمایشها و مراجعه مجدد زودتر." },
              };
              setF((p) => ({ ...p, ...presets[t] }));
            }}>
              <option value="">انتخاب قالب…</option>
              <option value="routine">ویزیت روتین</option>
              <option value="followup">پیگیری</option>
              <option value="acute">علائم حاد</option>
            </select>
          </label>
        </div>
        <AllergyBanner appointmentId={id} />
        <ErrorBox message={err} />
        {area("subjective", "S — شرح حال", "شکایت اصلی و سابقه به روایت بیمار")}
        {area("objective", "O — یافته‌ها", "معاینه، علائم حیاتی، نتایج")}
        {area("assessment", "A — ارزیابی / تشخیص", "برای امضا الزامی است")}
        {area("plan", "P — برنامه‌ی درمان", "برای امضا الزامی است")}

        <div className="stack gap-2">
          <span className="label">تشخیص‌ها (کد ICD-10 اختیاری، مثل J06.9)</span>
          {f.diagnoses.map((d, i) => (
            <div key={i} className="row">
              <input aria-label="کد ICD-10" className="input ltr mw-code" disabled={signed} value={d.code ?? ""} onChange={(e) => setF((p) => ({ ...p, diagnoses: p.diagnoses.map((x, j) => j === i ? { ...x, code: e.target.value.toUpperCase() } : x) }))} />
              <input aria-label="شرح تشخیص" className="input" disabled={signed} value={d.text} onChange={(e) => setF((p) => ({ ...p, diagnoses: p.diagnoses.map((x, j) => j === i ? { ...x, text: e.target.value } : x) }))} />
              {!signed && <button className="btn btn-sm btn-ghost" onClick={() => setF((p) => ({ ...p, diagnoses: p.diagnoses.filter((_, j) => j !== i) }))}>حذف</button>}
            </div>
          ))}
          {!signed && f.diagnoses.length < 10 && <button className="btn btn-sm self-start" onClick={() => setF((p) => ({ ...p, diagnoses: [...p.diagnoses, { text: "" }] }))}>+ تشخیص</button>}
        </div>

        <div className="field"><label className="label" htmlFor="ps">خلاصه‌ی ویزیت برای بیمار (پس از امضا برای بیمار نمایش داده می‌شود)</label>
          <textarea id="ps" className="textarea" disabled={signed} maxLength={4000} value={f.patientSummary} onChange={(e) => set("patientSummary", e.target.value)} placeholder="به زبان ساده؛ بدون اصطلاحات پیچیده" /></div>
        <div className="field mw-field-lg"><label className="label" htmlFor="fu">پیگیری بعد از (روز)</label>
          <input id="fu" className="input ltr" inputMode="numeric" disabled={signed} value={f.followUpDays} onChange={(e) => set("followUpDays", e.target.value.replace(/\D/g, "").slice(0, 3))} /></div>

        {!signed && (
          <div className="row"><button className="btn" disabled={busy} onClick={() => void save()}>ذخیره‌ی پیش‌نویس</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => setConfirm(true)}>امضا و نهایی‌سازی</button></div>
        )}
        {v.exists && <p className="help">آخرین تغییر: {formatDateTime(v.updatedAt)}{v.signedAt ? ` — امضا: ${formatDateTime(v.signedAt)}` : ""}</p>}
      </div>

      {signed && v.exists && (
        <div className="card stack">
          <h3>الحاقیه‌ها</h3>
          <p className="help">یادداشت امضاشده تغییر نمی‌کند؛ اصلاحات به‌صورت الحاقیه‌ی ثبت‌شده (غیرقابل حذف) اضافه می‌شود.</p>
          {v.addenda.map((a) => <div key={a.id} className="note-box"><div className="muted small">{formatDateTime(a.createdAt)}</div><div className="ws-pre-wrap">{a.body}</div></div>)}
          <textarea aria-label="الحاقیه" className="textarea" maxLength={4000} value={addendum} onChange={(e) => setAddendum(e.target.value)} />
          <button className="btn" disabled={busy || !addendum.trim()} onClick={() => void addAddendum()}>ثبت الحاقیه</button>
        </div>
      )}

      {confirm && (
        <Modal title="امضای یادداشت" onClose={() => setConfirm(false)}>
          <p>پس از امضا، متن SOAP دیگر قابل ویرایش نیست و خلاصه‌ی ویزیت برای بیمار منتشر می‌شود. ادامه می‌دهید؟</p>
          <ErrorBox message={err} />
          <div className="row"><button className="btn btn-primary" disabled={busy} onClick={() => void sign()}>بله، امضا شود</button><button className="btn btn-ghost" onClick={() => setConfirm(false)}>انصراف</button></div>
        </Modal>
      )}
    </div>
  );
}
export default function SoapPage() { return <RequireAuth roles={["DOCTOR"]}><Editor /></RequireAuth>; }
