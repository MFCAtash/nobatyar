"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { ErrorBox, Loading } from "@/components/ui";
import { MAX_SYMPTOMS, SEVERITY_FA, URGENCY_UI } from "@/lib/clinical";
import { useAuth } from "@/lib/auth-context";
import { formatToman, formatNumber } from "@/lib/format";
import { errorMessage } from "@/lib/messages";
import type { TriageCatalog, TriageFlag, TriageRun } from "@/lib/types";

type Sym = { code: string; severity: 1 | 2 | 3; durationDays?: number };

function Wizard() {
  const { api } = useAuth();
  const [cat, setCat] = useState<TriageCatalog | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<"" | "MALE" | "FEMALE">("");
  const [pregnant, setPregnant] = useState(false);
  const [syms, setSyms] = useState<Sym[]>([]);
  const [flags, setFlags] = useState<{ global: TriageFlag[]; specific: TriageFlag[] } | null>(null);
  const [yes, setYes] = useState<Set<string>>(new Set());
  const [run, setRun] = useState<TriageRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { api.get<TriageCatalog>("/triage/catalog").then(setCat).catch((e) => setErr(errorMessage(e))); }, [api]);

  const ageNum = Number(age);
  const ageOk = age !== "" && Number.isInteger(ageNum) && ageNum >= 0 && ageNum <= 120;
  const base = () => ({ ageYears: ageNum, ...(sex ? { sex } : {}), ...(pregnant ? { pregnant: true } : {}), symptoms: syms });

  const toggle = (code: string) =>
    setSyms((xs) => xs.some((s) => s.code === code) ? xs.filter((s) => s.code !== code) : xs.length < MAX_SYMPTOMS ? [...xs, { code, severity: 1 }] : xs);
  const patch = (code: string, p: Partial<Sym>) => setSyms((xs) => xs.map((s) => s.code === code ? { ...s, ...p } : s));

  async function next() {
    setBusy(true); setErr(null);
    try { setFlags(await api.post("/triage/flags", base())); setYes(new Set()); setStep(2); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  }
  async function submit() {
    setBusy(true); setErr(null);
    try { setRun(await api.post<TriageRun>("/triage", { ...base(), redFlags: [...yes] })); setStep(3); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  }
  const reset = () => { setStep(1); setRun(null); setFlags(null); setYes(new Set()); setSyms([]); };

  if (!cat) return err ? <ErrorBox message={err} /> : <Loading />;

  if (step === 3 && run) {
    const r = run.result, u = URGENCY_UI[r.urgency];
    return (
      <div className="stack mw-xl mx-auto">
        <div className={`card stack${r.urgency === "EMERGENCY" ? " card-emergency" : ""}`} role="alert">
          <h1 className="fs-xl">{u.icon} {u.text}</h1>
          <ul className="stack list-inset m-0 gap-2">{r.adviceFa.map((a) => <li key={a}>{a}</li>)}</ul>
          {r.emergencyContacts.length > 0 && (
            <div className="row">{r.emergencyContacts.map((c) => <a key={c.number} className="btn btn-danger" href={`tel:${c.number}`}>تماس با {c.number} — {c.labelFa}</a>)}</div>
          )}
        </div>
        {r.reasonsFa.length > 0 && <div className="card stack"><h3>چرا این نتیجه؟</h3><ul className="list-inset m-0">{r.reasonsFa.map((x) => <li key={x}>{x}</li>)}</ul></div>}
        {run.doctors.length > 0 && (
          <div className="card stack">
            <h3>پزشکان پیشنهادی{r.suggestedKind === "IN_PERSON" ? " (برای مراجعه‌ی حضوری یا ویزیت سریع)" : ""}</h3>
            {run.doctors.map((d) => (
              <Link key={d.id} href={`/doctors/${d.id}`} className="row between py-2">
                <span>{d.fullName} <span className="muted small">{d.specialties.map((s) => s.nameFa).join("، ")}</span></span>
                <span className="muted small">{formatToman(d.consultationFeeRial)}</span>
              </Link>
            ))}
          </div>
        )}
        <p className="help">{r.disclaimerFa}</p>
        <div className="row"><button className="btn" onClick={reset}>ارزیابی تازه</button><Link className="btn btn-ghost" href="/">جستجوی پزشک</Link></div>
      </div>
    );
  }

  return (
    <div className="card stack mw-xl mx-auto">
      <h1 className="fs-xl m-0">ارزیابی اولیه‌ی علائم</h1>
      <p className="help">مرحله {step === 1 ? "۱" : "۲"} از ۲ — این ابزار تشخیص نیست؛ فقط کمک می‌کند بدانید چقدر زود و نزد چه پزشکی بروید. در وضعیت اضطراری مستقیم با ۱۱۵ تماس بگیرید.</p>
      <ErrorBox message={err} />

      {step === 1 && (
        <>
          <div className="grid grid-2">
            <div className="field"><label className="label" htmlFor="age">سن (سال؛ زیر یک سال = ۰)</label><input id="age" className="input ltr" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} /></div>
            <div className="field"><label className="label" htmlFor="sex">جنسیت (اختیاری)</label>
              <select id="sex" className="input" value={sex} onChange={(e) => { setSex(e.target.value as typeof sex); if (e.target.value !== "FEMALE") setPregnant(false); }}>
                <option value="">—</option><option value="FEMALE">زن</option><option value="MALE">مرد</option></select></div>
          </div>
          {sex === "FEMALE" && <label className="check"><input type="checkbox" checked={pregnant} onChange={(e) => setPregnant(e.target.checked)} /> باردار هستم</label>}
          <div className="field">
            <span className="label">مشکل اصلی (حداکثر {formatNumber(MAX_SYMPTOMS)} مورد)</span>
            <div className="chips">{cat.complaints.map((c) => <button key={c.code} type="button" className="chip" aria-pressed={syms.some((s) => s.code === c.code)} onClick={() => toggle(c.code)}>{c.labelFa}</button>)}</div>
          </div>
          {syms.map((s) => (
            <div key={s.code} className="grid grid-2">
              <div className="field"><label className="label" htmlFor={`sv-${s.code}`}>شدت — {cat.complaints.find((c) => c.code === s.code)?.labelFa}</label>
                <select id={`sv-${s.code}`} className="input" value={s.severity} onChange={(e) => patch(s.code, { severity: Number(e.target.value) as 1 | 2 | 3 })}>{([1, 2, 3] as const).map((v) => <option key={v} value={v}>{SEVERITY_FA[v]}</option>)}</select></div>
              <div className="field"><label className="label" htmlFor={`du-${s.code}`}>چند روز است؟ (اختیاری)</label>
                <input id={`du-${s.code}`} className="input ltr" inputMode="numeric" value={s.durationDays ?? ""} onChange={(e) => patch(s.code, { durationDays: e.target.value === "" ? undefined : Math.min(3650, Number(e.target.value.replace(/\D/g, "")) || 0) })} /></div>
            </div>
          ))}
          <button className="btn btn-primary" disabled={busy || !ageOk || syms.length === 0} onClick={() => void next()}>ادامه</button>
        </>
      )}

      {step === 2 && flags && (
        <>
          <p>آیا هیچ‌یک از موارد زیر وجود دارد؟ (هر مورد را که «بله» است علامت بزنید)</p>
          <div className="stack gap-2">
            {[...flags.global, ...flags.specific].map((f) => (
              <label key={f.id} className="check"><input type="checkbox" checked={yes.has(f.id)} onChange={(e) => setYes((p) => { const n = new Set(p); if (e.target.checked) n.add(f.id); else n.delete(f.id); return n; })} /> {f.textFa}</label>
            ))}
          </div>
          <div className="row"><button className="btn btn-primary" disabled={busy} onClick={() => void submit()}>دریافت نتیجه</button><button className="btn btn-ghost" onClick={() => setStep(1)}>بازگشت</button></div>
        </>
      )}
    </div>
  );
}

export default function TriagePage() { return <RequireAuth roles={["PATIENT"]}><Wizard /></RequireAuth>; }
