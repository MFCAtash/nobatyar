import { EmptyState, Skeleton, Stepper, type Step } from "@/components/kit";
import { ErrorBox } from "@/components/ui";
import { dayLabelFromDateStr, formatDateTime, formatTime } from "@/lib/format";
import { KIND_LABEL } from "@/lib/messages";
import type { AppointmentKind } from "@/lib/types";

export const BOOKING_STEPS: Step[] = [
  { id: "time", label: "انتخاب زمان" },
  { id: "details", label: "جزئیات ویزیت" },
  { id: "confirm", label: "تأیید و ثبت" },
];

export interface BookingViewProps {
  days: string[];
  day: string;
  /** undefined = در حال بارگذاری */
  slots: { startsAt: string; endsAt: string }[] | undefined;
  slot: string | null;
  kind: AppointmentKind;
  reason: string;
  step: 0 | 1 | 2;
  busy: boolean;
  error: string | null;
  authed: boolean;
  canBook: boolean;
  restored: boolean;
  onDay: (d: string) => void;
  onSlot: (s: string) => void;
  onKind: (k: AppointmentKind) => void;
  onReason: (r: string) => void;
  onStep: (s: 0 | 1 | 2) => void;
  onSubmit: () => void;
  onDiscardDraft: () => void;
}

export function BookingView(p: BookingViewProps) {
  return (
    <section className="card stack" aria-labelledby="book-h">
      <h2 id="book-h" className="fs-md m-0">رزرو نوبت</h2>
      {!p.canBook ? <div className="note-box">فقط حساب «بیمار» می‌تواند نوبت رزرو کند.</div> : (
        <>
          <Stepper steps={BOOKING_STEPS} current={p.step} label="مراحل رزرو نوبت" />
          {p.restored && (
            <div className="note-box row between" role="status">
              پیش‌نویس قبلی شما بازیابی شد.
              <button type="button" className="btn btn-ghost btn-xs" onClick={p.onDiscardDraft}>پاک کردن پیش‌نویس</button>
            </div>
          )}

          {p.step === 0 && (
            <>
              <div className="days" role="group" aria-label="روز">
                {p.days.map((d) => <button key={d} type="button" aria-pressed={d === p.day} className="chip" onClick={() => p.onDay(d)}>{dayLabelFromDateStr(d)}</button>)}
              </div>
              {p.slots === undefined ? <div className="slot-grid" role="status" aria-label="در حال بارگذاری ساعت‌ها">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} shape="block" />)}</div>
                : p.slots.length === 0 ? <EmptyState icon="🗓️" title="برای این روز وقت خالی وجود ندارد" description="روز دیگری را انتخاب کنید." />
                : (
                  <div className="slot-grid" role="group" aria-label="ساعت‌های خالی">
                    {p.slots.map((s) => <button key={s.startsAt} type="button" className="slot num" aria-pressed={p.slot === s.startsAt} onClick={() => p.onSlot(s.startsAt)}>{formatTime(s.startsAt)}</button>)}
                  </div>
                )}
              <ErrorBox message={p.error} />
              <button type="button" className="btn btn-primary" disabled={!p.slot} onClick={() => p.onStep(1)}>ادامه</button>
            </>
          )}

          {p.step === 1 && p.slot && (
            <>
              <div className="note-box">زمان انتخابی: <strong>{formatDateTime(p.slot)}</strong></div>
              <div className="field">
                <label className="label" htmlFor="kind">نوع ویزیت</label>
                <select id="kind" className="select" value={p.kind} onChange={(e) => p.onKind(e.target.value as AppointmentKind)}>
                  {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="reason">دلیل مراجعه (اختیاری)</label>
                <textarea id="reason" className="textarea" maxLength={1000} value={p.reason} onChange={(e) => p.onReason(e.target.value)} aria-describedby="reason-h" />
                <span id="reason-h" className="help">این متن رمزنگاری می‌شود و فقط پزشک همین نوبت آن را می‌بیند. تا بستن تب به‌عنوان پیش‌نویس نگه داشته می‌شود.</span>
              </div>
              <div className="row">
                <button type="button" className="btn btn-ghost" onClick={() => p.onStep(0)}>بازگشت</button>
                <button type="button" className="btn btn-primary flex-1" onClick={() => p.onStep(2)}>ادامه</button>
              </div>
            </>
          )}

          {p.step === 2 && p.slot && (
            <>
              <dl className="dl stack gap-2">
                <div><dt className="muted small">زمان</dt><dd className="fw-medium">{formatDateTime(p.slot)}</dd></div>
                <div><dt className="muted small">نوع ویزیت</dt><dd className="fw-medium">{KIND_LABEL[p.kind]}</dd></div>
                {p.reason.trim() && <div><dt className="muted small">دلیل مراجعه</dt><dd className="ws-pre-wrap">{p.reason.trim()}</dd></div>}
              </dl>
              <ErrorBox message={p.error} />
              <div className="row">
                <button type="button" className="btn btn-ghost" disabled={p.busy} onClick={() => p.onStep(1)}>ویرایش</button>
                <button type="button" className="btn btn-primary flex-1" disabled={p.busy} onClick={p.onSubmit}>
                  {p.busy ? "در حال ثبت…" : p.authed ? "ثبت نوبت" : "ورود و ثبت نوبت"}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
