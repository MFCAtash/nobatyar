"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { ErrorBox, Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/messages";
import type { SoCandidate, VisitSummary } from "@/lib/types";

interface Rec { id: string; title: string; category: string }

function Form() {
  const { id } = useParams<{ id: string }>();
  const { api } = useAuth();
  const router = useRouter();
  const [cands, setCands] = useState<SoCandidate[] | null>(null);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [hasSummary, setHasSummary] = useState(false);
  const [doctorId, setDoctorId] = useState("");
  const [question, setQuestion] = useState(""); const [caseSummary, setCaseSummary] = useState("");
  const [age, setAge] = useState(""); const [gender, setGender] = useState("");
  const [recIds, setRecIds] = useState<Set<string>>(new Set()); const [withSummary, setWithSummary] = useState(false);
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<SoCandidate[]>(`/second-opinions/candidates?appointmentId=${id}`).then(setCands).catch((e) => setErr(errorMessage(e)));
    api.get<{ records: Rec[] }>("/records").then((r) => setRecs(r.records)).catch(() => undefined);
    api.get<VisitSummary>(`/appointments/${id}/visit-summary`).then(() => setHasSummary(true)).catch(() => setHasSummary(false));
  }, [api, id]);
  if (!cands) return err ? <ErrorBox message={err} /> : <Loading />;

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const r = await api.post<{ id: string }>("/second-opinions", {
        appointmentId: id, doctorId, question, caseSummary, recordIds: [...recIds], includeVisitSummary: withSummary,
        ...(age ? { ageYears: Number(age) } : {}), ...(gender ? { gender } : {}),
      });
      router.replace(`/second-opinions/${r.id}`);
    } catch (e) { setErr(errorMessage(e)); setBusy(false); }
  }

  return (
    <div className="card stack mw-xl mx-auto">
      <h1 className="fs-xl m-0">درخواست نظر دوم</h1>
      <p className="help">پزشک دوم نام و موبایل شما را نمی‌بیند؛ فقط آنچه اینجا می‌نویسید و مواردی که صریحاً ضمیمه می‌کنید. دسترسی او موقت است و با رد/لغو فوراً قطع می‌شود.</p>
      <ErrorBox message={err} />
      {cands.length === 0 ? <div className="empty">فعلاً پزشکی پذیرای نظر دوم نیست.</div> : (
        <fieldset className="stack reset-btn">
          <legend className="label">انتخاب پزشک</legend>
          {cands.map((c) => (
            <label key={c.id} className="check"><input type="radio" name="doc" checked={doctorId === c.id} onChange={() => setDoctorId(c.id)} />
              <span>{c.fullName} <span className="muted small">{c.specialties.map((s) => s.nameFa).join("، ")}{c.sameSpecialty ? " — هم‌تخصص" : ""}</span></span></label>
          ))}
        </fieldset>
      )}
      <div className="field"><label className="label" htmlFor="q">پرسش شما (حداقل ۱۰ نویسه)</label><textarea id="q" className="textarea" maxLength={2000} value={question} onChange={(e) => setQuestion(e.target.value)} /></div>
      <div className="field"><label className="label" htmlFor="cs">خلاصه‌ی مورد (تشخیص و درمانی که گفته شده)</label><textarea id="cs" className="textarea" maxLength={4000} value={caseSummary} onChange={(e) => setCaseSummary(e.target.value)} /></div>
      <div className="grid grid-2">
        <div className="field"><label className="label" htmlFor="ag">سن (اختیاری)</label><input id="ag" className="input ltr" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} /></div>
        <div className="field"><label className="label" htmlFor="gn">جنسیت (اختیاری)</label><select id="gn" className="input" value={gender} onChange={(e) => setGender(e.target.value)}><option value="">—</option><option value="FEMALE">زن</option><option value="MALE">مرد</option></select></div>
      </div>
      {hasSummary && <label className="check"><input type="checkbox" checked={withSummary} onChange={(e) => setWithSummary(e.target.checked)} /> خلاصه‌ی ویزیت همین نوبت دیده شود</label>}
      {recs.length > 0 && (
        <fieldset className="stack reset-btn"><legend className="label">ضمیمه‌کردن پرونده‌ها (حداکثر ۱۰)</legend>
          {recs.map((r) => <label key={r.id} className="check"><input type="checkbox" checked={recIds.has(r.id)} onChange={(e) => setRecIds((p) => { const n = new Set(p); if (e.target.checked && n.size < 10) n.add(r.id); else n.delete(r.id); return n; })} /> {r.title}</label>)}
        </fieldset>
      )}
      <div className="row"><button className="btn btn-primary" disabled={busy || !doctorId || question.trim().length < 10} onClick={() => void submit()}>ارسال درخواست</button><Link className="btn btn-ghost" href={`/appointments/${id}`}>انصراف</Link></div>
    </div>
  );
}
export default function RequestSecondOpinion() { return <RequireAuth roles={["PATIENT"]}><Form /></RequireAuth>; }
