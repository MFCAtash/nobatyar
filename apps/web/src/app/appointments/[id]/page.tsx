"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppointmentActions } from "@/components/AppointmentActions";
import { ReschedulePanel } from "@/components/ReschedulePanel";
import { ClinicalPanel } from "@/components/ClinicalPanel";
import { NpsCard } from "@/components/NpsCard";
import { RequireAuth } from "@/components/RequireAuth";
import { ErrorBox, kindLabel, Loading, StatusBadge } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatCountdown, formatDateTime, formatToman } from "@/lib/format";
import { videoUiState } from "@/lib/video-window";
import { errorMessage } from "@/lib/messages";
import type { AppointmentDetail } from "@/lib/types";

function Detail() {
  const { id } = useParams<{ id: string }>();
  const { api, me } = useAuth();
  const [a, setA] = useState<AppointmentDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try { setA(await api.get<AppointmentDetail>(`/appointments/${id}`)); }
    catch (e) { if (e instanceof ApiError && e.status === 404) setNotFound(true); else setErr(errorMessage(e)); }
  }, [api, id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  if (notFound) return <div className="empty">نوبت پیدا نشد.</div>;
  if (err) return <ErrorBox message={err} />;
  if (!a || !me) return <Loading />;

  const isDoctor = me.id === a.doctor.id;
  const vu = videoUiState(a, now);
  const holdLeft = a.status === "PENDING_PAYMENT" && a.holdExpiresAt ? Math.max(0, Math.floor((new Date(a.holdExpiresAt).getTime() - now) / 1000)) : null;

  return (
    <div className="card stack mw-lg mx-auto">
      <div className="row between"><h1 className="fs-xl m-0">جزئیات نوبت</h1><StatusBadge status={a.status} /></div>
      <dl className="stack gap-2 m-0">
        <div><dt className="muted small">{isDoctor ? "بیمار" : "پزشک"}</dt><dd className="m-0">{isDoctor ? a.patient.fullName || "—" : <Link href={`/doctors/${a.doctor.id}`}>{a.doctor.fullName}</Link>}</dd></div>
        <div><dt className="muted small">زمان</dt><dd className="m-0">{formatDateTime(a.startsAt)}</dd></div>
        <div><dt className="muted small">نوع ویزیت</dt><dd className="m-0">{kindLabel(a.kind)}</dd></div>
        {a.kind === "IN_PERSON" && a.doctor.clinic && (
          <div>
            <dt className="muted small">محل ویزیت</dt>
            <dd className="m-0">
              {a.doctor.clinic.name || "مطب پزشک"}
              {a.doctor.clinic.address && <span className="muted small"> — {a.doctor.clinic.address}</span>}
              {a.doctor.clinic.phone && <span className="muted small"> — تلفن: {a.doctor.clinic.phone}</span>}
            </dd>
          </div>
        )}
        <div><dt className="muted small">هزینه</dt><dd className="m-0">{formatToman(a.priceRial)}</dd></div>
        {a.reason && <div><dt className="muted small">دلیل مراجعه</dt><dd className="m-0 ws-pre-wrap">{a.reason}</dd></div>}
      </dl>

      {a.status === "PENDING_PAYMENT" && (
        <div className="note-box">
          این وقت تا <strong className="num">{holdLeft === null ? "—" : formatCountdown(holdLeft)}</strong> برای شما نگه داشته می‌شود.
          {!isDoctor && <div className="mt-3"><Link href={`/payment?appointmentId=${a.id}`} className="btn btn-primary">پرداخت و نهایی‌سازی نوبت</Link></div>}
        </div>
      )}
      {a.status === "PENDING_CONFIRMATION" && <div className="note-box">نوبت شما ثبت شد و منتظر تأیید پزشک است.</div>}
      {(a.status === "CONFIRMED" || a.status === "IN_PROGRESS") && a.kind === "VIDEO" && (
        vu.state === "open"
          ? <Link href={`/appointments/${a.id}/video`} className="btn btn-primary">ورود به ویزیت تصویری</Link>
          : vu.state === "early"
            ? <div className="note-box">ورود به ویزیت تصویری از {formatDateTime(vu.opensAt)} فعال می‌شود.</div>
            : null
      )}

      {(a.status === "CONFIRMED" || a.status === "PENDING_CONFIRMATION") && (
        <ReschedulePanel appointment={a} onDone={() => void load()} />
      )}

      <ClinicalPanel id={a.id} status={a.status} endsAt={a.endsAt} isDoctor={isDoctor} />

      <AppointmentActions a={a} onDone={() => void load()} />
      {a.status === "COMPLETED" && <NpsCard appointmentId={a.id} />}
      {a.status === "CONFIRMED" && <Link href={`/appointments/${a.id}/waiting`} className="btn self-start">رفتن به اتاق انتظار</Link>}
    </div>
  );
}

export default function AppointmentPage() {
  return <RequireAuth><Detail /></RequireAuth>;
}
