"use client";
import { formatNumber } from "@/lib/format";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useToast } from "@/components/Toast";
import { ErrorBox, Loading } from "@/components/ui";
import { formatHoursLeft, hoursLeft, SO_UI } from "@/lib/clinical";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/messages";
import type { SoDetail } from "@/lib/types";

const URG = { ROUTINE: "غیرفوری", SOON: "ظرف چند روز", URGENT: "فوری" } as const;

function Detail() {
  const { id } = useParams<{ id: string }>();
  const { api } = useAuth();
  const toast = useToast();
  const [d, setD] = useState<SoDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [opinion, setOpinion] = useState(""); const [recs, setRecs] = useState(""); const [inPerson, setInPerson] = useState(false); const [urgency, setUrgency] = useState("");

  const load = useCallback(() => api.get<SoDetail>(`/second-opinions/${id}`).then(setD).catch((e) => setErr(errorMessage(e))), [api, id]);
  useEffect(() => { void load(); }, [load]);
  if (!d) return err ? <ErrorBox message={err} /> : <Loading />;

  async function act(path: string, msg: string, body?: unknown) {
    setBusy(true); setErr(null);
    try { await api.post(`/second-opinions/${id}/${path}`, body); toast(msg, "ok"); await load(); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  }
  const s = SO_UI[d.status];
  const dl = d.status === "REQUESTED" ? d.acceptDeadlineAt : d.status === "ACCEPTED" ? d.answerDeadlineAt : null;
  const isDoc = d.role === "doctor";

  return (
    <div className="stack mw-xl mx-auto">
      <div className="card stack">
        <div className="row between"><h1 className="fs-xl m-0">نظر دوم</h1><span className={`badge badge-${s.tone}`}>{s.text}</span></div>
        {d.doctorName && <div>پزشک: {d.doctorName}</div>}
        {dl && <div className="note-box">مهلت باقی‌مانده: <strong>{formatHoursLeft(hoursLeft(dl))}</strong></div>}
        <ErrorBox message={err} />
        <div><div className="muted small">پرسش</div><div className="ws-pre-wrap">{d.request.question}</div></div>
        {d.request.caseSummary && <div><div className="muted small">خلاصه‌ی مورد</div><div className="ws-pre-wrap">{d.request.caseSummary}</div></div>}
        {isDoc && (d.request.ageYears !== null || d.request.gender) && <div className="muted small">بیمار: {d.request.ageYears !== null ? `${formatNumber(d.request.ageYears)} ساله` : ""} {d.request.gender === "FEMALE" ? "زن" : d.request.gender === "MALE" ? "مرد" : ""}</div>}
      </div>

      {isDoc && d.visitSummary && <div className="card stack"><h3>خلاصه‌ی ویزیت قبلی (با اجازه‌ی بیمار)</h3><div className="ws-pre-wrap">{d.visitSummary.text}</div></div>}
      {isDoc && d.records.length > 0 && (
        <div className="card stack"><h3>پرونده‌های به‌اشتراک‌گذاشته</h3>
          {d.records.map((r) => <Link key={r.id} href={`/records/${r.id}`} className="row between"><span>{r.title}</span><span className="muted small">{formatNumber(r.attachmentCount)} پیوست</span></Link>)}
          <p className="help">دسترسی شما به این پرونده‌ها موقت است و با پایان یا رد درخواست لغو می‌شود.</p></div>
      )}

      {d.response && (
        <div className="card stack"><h3>پاسخ پزشک</h3>
          <div className="ws-pre-wrap">{d.response.opinion}</div>
          {d.response.recommendations && <div><div className="muted small">توصیه‌ها</div><div className="ws-pre-wrap">{d.response.recommendations}</div></div>}
          {d.response.urgency && <div>فوریت پیشنهادی: <strong>{URG[d.response.urgency]}</strong></div>}
          {d.response.needsInPerson && <div className="note-box">پزشک مراجعه‌ی حضوری را توصیه کرده است.</div>}
          <p className="help">نظر دوم جایگزین ویزیت و تصمیم پزشک معالج نیست.</p>
        </div>
      )}

      {isDoc && d.status === "REQUESTED" && <div className="row"><button className="btn btn-primary" disabled={busy} onClick={() => void act("accept", "درخواست پذیرفته شد.")}>پذیرش</button><button className="btn" disabled={busy} onClick={() => void act("decline", "درخواست رد شد.")}>رد</button></div>}
      {isDoc && d.status === "ACCEPTED" && (
        <div className="card stack"><h3>ثبت پاسخ</h3>
          <div className="field"><label className="label" htmlFor="op">نظر شما (حداقل ۲۰ نویسه)</label><textarea id="op" className="textarea textarea-lg" maxLength={8000} value={opinion} onChange={(e) => setOpinion(e.target.value)} /></div>
          <div className="field"><label className="label" htmlFor="rc">توصیه‌ها (اختیاری)</label><textarea id="rc" className="textarea" maxLength={4000} value={recs} onChange={(e) => setRecs(e.target.value)} /></div>
          <div className="grid grid-2">
            <label className="check"><input type="checkbox" checked={inPerson} onChange={(e) => setInPerson(e.target.checked)} /> مراجعه‌ی حضوری لازم است</label>
            <div className="field"><label className="label" htmlFor="ur">فوریت پیشنهادی</label><select id="ur" className="input" value={urgency} onChange={(e) => setUrgency(e.target.value)}><option value="">—</option><option value="ROUTINE">غیرفوری</option><option value="SOON">ظرف چند روز</option><option value="URGENT">فوری</option></select></div>
          </div>
          <button className="btn btn-primary" disabled={busy || opinion.trim().length < 20} onClick={() => void act("answer", "پاسخ ثبت شد.", { opinion, recommendations: recs || undefined, needsInPerson: inPerson, urgency: urgency || undefined })}>ثبت نهایی پاسخ</button>
        </div>
      )}
      {!isDoc && (d.status === "REQUESTED" || d.status === "ACCEPTED") && <button className="btn btn-danger self-start" disabled={busy} onClick={() => void act("cancel", "درخواست لغو شد.")}>لغو درخواست</button>}
    </div>
  );
}
export default function SecondOpinionDetail() { return <RequireAuth roles={["PATIENT", "DOCTOR"]}><Detail /></RequireAuth>; }
