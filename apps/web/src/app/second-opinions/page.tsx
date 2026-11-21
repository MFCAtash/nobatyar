"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useToast } from "@/components/Toast";
import { ErrorBox, Loading } from "@/components/ui";
import { formatHoursLeft, hoursLeft, SO_UI } from "@/lib/clinical";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/messages";
import type { SoListItem } from "@/lib/types";

function List() {
  const { api, me } = useAuth();
  const toast = useToast();
  const isDoctor = me?.role === "DOCTOR";
  const [rows, setRows] = useState<SoListItem[] | null>(null);
  const [accepts, setAccepts] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get<SoListItem[]>("/second-opinions").then(setRows).catch((e) => setErr(errorMessage(e)));
    if (isDoctor) api.get<{ accepts: boolean }>("/second-opinions/settings").then((r) => setAccepts(r.accepts)).catch(() => undefined);
  }, [api, isDoctor]);

  async function toggle(v: boolean) {
    try { await api.patch("/second-opinions/settings", { accepts: v }); setAccepts(v); toast(v ? "درخواست نظر دوم را می‌پذیرید." : "دیگر درخواست جدید دریافت نمی‌کنید.", "ok"); }
    catch (e) { setErr(errorMessage(e)); }
  }
  if (!rows) return err ? <ErrorBox message={err} /> : <Loading />;
  const deadline = (r: SoListItem) => (r.status === "REQUESTED" ? r.acceptDeadlineAt : r.status === "ACCEPTED" ? r.answerDeadlineAt : null);

  return (
    <div className="stack mw-xl mx-auto">
      <h1 className="fs-xl">{isDoctor ? "درخواست‌های نظر دوم" : "نظر دوم من"}</h1>
      {isDoctor && accepts !== null && (
        <label className="check card"><input type="checkbox" checked={accepts} onChange={(e) => void toggle(e.target.checked)} /> پذیرش درخواست نظر دوم از بیماران دیگر پزشکان (هویت بیمار برای شما نمایش داده نمی‌شود)</label>
      )}
      <ErrorBox message={err} />
      {!isDoctor && <p className="help">برای درخواست، از جزئیات یک نوبتِ انجام‌شده «درخواست نظر دوم» را بزنید.</p>}
      {rows.length === 0 ? <div className="empty">موردی وجود ندارد.</div> : rows.map((r) => {
        const d = deadline(r), s = SO_UI[r.status];
        return (
          <Link key={r.id} href={`/second-opinions/${r.id}`} className="card row between">
            <span>{r.doctorName ? `از دکتر ${r.doctorName}` : "درخواست نظر دوم"} <span className="muted small">— {formatDateTime(r.createdAt)}</span></span>
            <span className="row"><span className={`badge badge-${s.tone}`}>{s.text}</span>{d && <span className="muted small">مهلت: {formatHoursLeft(hoursLeft(d))}</span>}</span>
          </Link>
        );
      })}
    </div>
  );
}
export default function SecondOpinionsPage() { return <RequireAuth roles={["PATIENT", "DOCTOR"]}><List /></RequireAuth>; }
