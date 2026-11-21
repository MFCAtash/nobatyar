"use client";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { ErrorBox } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime, nextTehranDays, tehranDateStr } from "@/lib/format";
import { errorMessage } from "@/lib/messages";
import type { AppointmentDetail, SlotsResponse } from "@/lib/types";

const ERROR_FA: Record<string, string> = {
  slot_taken: "این زمان همین حالا توسط بیمار دیگری رزرو شد؛ وقت دیگری انتخاب کنید.",
  too_early: "جابهجایی حداقل ۳۰ دقیقه قبل از شروع نوبت مجاز است.",
  too_late: "نوبت آغاز شده و قابل جابهجایی نیست.",
  invalid_state: "وضعیت فعلی نوبت اجازهٔ جابهجایی نمیدهد.",
  patient_time_conflict: "شما در این زمان نوبت دیگری دارید.",
  concurrent_modification: "نوبت همزمان توسط طرف مقابل تغییر یافت؛ دوباره تلاش کنید.",
};

/**
 * جابهجایی اتمی نوبت: لیست اسلاتها از همان endpointای که رزرو استفاده میکند میآید،
 * سپس POST /appointments/:id/reschedule بدون لغو/پرداخت مجدد.
 */
export function ReschedulePanel({ appointment, onDone }: { appointment: AppointmentDetail; onDone: () => void }) {
  const { api } = useAuth();
  const toast = useToast();
  const [date, setDate] = useState(() => tehranDateStr(new Date(Date.now() + 86_400_000)));
  const [slots, setSlots] = useState<string[]>([]);
  const [picked, setPicked] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSlots = useCallback(async () => {
    setErr(null);
    try {
      const r = await api.get<SlotsResponse>(`/doctors/${appointment.doctor.id}/slots?from=${date}&to=${date}`);
      setSlots(r.slots.map((s) => s.startsAt));
      setPicked("");
    } catch (e) {
      setErr(errorMessage(e));
    }
  }, [api, appointment.doctor.id, date]);

  useEffect(() => { void loadSlots(); }, [loadSlots]);

  const submit = async () => {
    if (!picked) return;
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/appointments/${appointment.id}/reschedule`, { startsAt: picked });
      toast("زمان نوبت تغییر یافت", "ok");
      onDone();
    } catch (e) {
      const code = (e as { code?: string }).code;
      setErr(ERROR_FA[code ?? ""] ?? errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  /** نزدیکترین وقت آزاد را در ۱۴ روز آینده پیدا میکند (همان endpoint اسلاتها). */
  const nearest = async () => {
    setBusy(true); setErr(null);
    try {
      for (const day of nextTehranDays(14)) {
        const r = await api.get<SlotsResponse>(`/doctors/${appointment.doctor.id}/slots?from=${day}&to=${day}`);
        if (r.slots.length > 0) {
          setDate(day);
          setSlots(r.slots.map((s) => s.startsAt));
          setPicked(r.slots[0]!.startsAt);
          toast("نزدیکترین وقت آزاد یافت شد", "ok");
          return;
        }
      }
      toast("در ۱۴ روز آینده وقت آزادی یافت نشد", "bad");
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="note-box" aria-label="جابهجایی نوبت">
      <h3 className="m-0">جابهجایی نوبت</h3>
      <p className="muted small">بدون لغو و پرداخت مجدد؛ پرداختی که انجام شده دستنخورده میماند.</p>
      <div className="row gap-2 wrap mt-2">
        <label>
          <span className="muted small">تاریخ مورد نظر</span>
          <input type="date" value={date} min={tehranDateStr(new Date())} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button className="btn ghost" type="button" onClick={() => void loadSlots()}>جستجوی وقت</button>
        <button className="btn" type="button" disabled={busy} onClick={() => void nearest()}>نزدیکترین وقت آزاد</button>
      </div>
      {slots.length > 0 && (
        <>
          <div className="row gap-2 wrap mt-2" aria-label="کشیدن وقت به محل جابهجایی">
            {slots.slice(0, 12).map((s) => (
              <button key={s} type="button" className={`btn btn-sm slot-chip ${picked === s ? "btn-primary" : ""}`} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", s)} onClick={() => setPicked(s)}>
                {formatDateTime(s)}
              </button>
            ))}
          </div>
          <div className="drop-zone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const s = e.dataTransfer.getData("text/plain"); if (s) setPicked(s); }}>
            وقت مورد نظر را اینجا رها کنید تا انتخاب شود {picked && <strong className="num">— {formatDateTime(picked)}</strong>}
          </div>
        </>
      )}
      {slots.length > 0 && (
        <div className="row gap-2 wrap mt-2">
          <label>
            <span className="muted small">وقت آزاد</span>
            <select value={picked} onChange={(e) => setPicked(e.target.value)}>
              <option value="">انتخاب کنید</option>
              {slots.map((s) => <option key={s} value={s}>{formatDateTime(s)}</option>)}
            </select>
          </label>
          <button className="btn btn-primary" type="button" disabled={!picked || busy} onClick={() => void submit()}>
            {busy ? "در حال ثبت…" : "تأیید جابهجایی"}
          </button>
        </div>
      )}
      {slots.length === 0 && !err && <p className="muted small">برای این تاریخ وقت آزادی یافت نشد.</p>}
      <ErrorBox message={err} />
    </section>
  );
}
