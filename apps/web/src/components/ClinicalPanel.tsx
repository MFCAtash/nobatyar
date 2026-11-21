"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { clinicalWindowOpen } from "@/lib/clinical";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { VisitSummary } from "@/lib/types";

/** بخش بالینی نوبت: پزشک ⇒ SOAP/نسخه؛ بیمار ⇒ خلاصه‌ی ویزیت، نسخه‌ها، نظر دوم. (سرور تصمیم نهایی دسترسی را می‌گیرد.) */
export function ClinicalPanel({ id, status, endsAt, isDoctor }: { id: string; status: string; endsAt: string; isDoctor: boolean }) {
  const { api } = useAuth();
  const [summary, setSummary] = useState<VisitSummary | null>(null);
  const done = status === "COMPLETED";

  useEffect(() => {
    if (!isDoctor && done) api.get<VisitSummary>(`/appointments/${id}/visit-summary`).then(setSummary).catch(() => setSummary(null));
  }, [api, id, isDoctor, done]);

  if (isDoctor) {
    if (!clinicalWindowOpen(status, endsAt) && !done) return null;
    return (
      <div className="stack gap-2">
        <h3 className="m-0">پرونده‌ی بالینی</h3>
        <div className="row"><Link className="btn btn-sm" href={`/appointments/${id}/soap`}>یادداشت SOAP</Link><Link className="btn btn-sm" href={`/appointments/${id}/prescriptions`}>نسخه‌ها</Link></div>
      </div>
    );
  }
  if (!done && status !== "IN_PROGRESS") return null;
  return (
    <div className="stack gap-2">
      <h3 className="m-0">پس از ویزیت</h3>
      {summary && (
        <div className="note-box"><div className="muted small">خلاصه‌ی ویزیت — {summary.doctorName}، {formatDateTime(summary.publishedAt)}</div>
          <div className="ws-pre-wrap">{summary.text}</div>
          {summary.followUpDays && <div className="small">پیگیری پیشنهادی: {formatNumber(summary.followUpDays)} روز دیگر</div>}</div>
      )}
      <div className="row">
        <Link className="btn btn-sm" href={`/appointments/${id}/prescriptions`}>نسخه‌های این نوبت</Link>
        {done && <Link className="btn btn-sm" href={`/appointments/${id}/second-opinion`}>درخواست نظر دوم</Link>}
      </div>
    </div>
  );
}
