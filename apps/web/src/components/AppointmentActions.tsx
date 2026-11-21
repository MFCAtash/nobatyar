"use client";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { estimateRefundPercent, formatNumber, formatToman } from "@/lib/format";
import { errorMessage } from "@/lib/messages";
import { videoUiState } from "@/lib/video-window";
import type { ActionResult, AppointmentItem } from "@/lib/types";
import { useToast } from "./Toast";
import { ErrorBox, Modal } from "./ui";

const MIN = 60_000;

/** دکمه‌های مجاز بر اساس نقش، وضعیت و زمان (فقط UX؛ سرور تصمیم نهایی را می‌گیرد). */
export function AppointmentActions({ a, onDone, compact = false }: { a: AppointmentItem; onDone: () => void; compact?: boolean }) {
  const { api, me } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!me) return null;
  const isDoctor = me.id === a.doctor.id;
  const isPatient = me.id === a.patient.id;
  const now = Date.now();
  const start = new Date(a.startsAt).getTime();
  const end = new Date(a.endsAt).getTime();
  const s = a.status;

  const can = {
    confirm: isDoctor && s === "PENDING_CONFIRMATION" && now < start,
    cancel: (isDoctor ? ["PENDING_CONFIRMATION", "CONFIRMED"] : ["PENDING_PAYMENT", "PENDING_CONFIRMATION", "CONFIRMED"]).includes(s) && now < start && (isDoctor || isPatient),
    start: isDoctor && s === "CONFIRMED" && now >= start - 10 * MIN && now < end,
    complete: isDoctor && s === "IN_PROGRESS",
    noShow: s === "CONFIRMED" && ((isDoctor && now >= start + 10 * MIN) || (isPatient && now >= start + 15 * MIN)),
  };

  async function run(action: string, label: string) {
    setBusy(action); setErr(null);
    try {
      const r = await api.post<ActionResult>(`/appointments/${a.id}/${action}`);
      toast(label, "ok");
      if (r.refundRial && r.refundRial !== "0") toast(`بازپرداخت ${formatToman(r.refundRial)} ثبت شد.`, "info");
      setConfirmCancel(false);
      onDone();
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(null); }
  }

  const canJoinVideo = (isDoctor || isPatient) && videoUiState(a, now).state === "open";
  const sz = compact ? "btn btn-sm" : "btn";
  const paid = BigInt(a.priceRial) > 0n && s !== "PENDING_PAYMENT";
  const pct = estimateRefundPercent(a.startsAt);

  return (
    <div className="stack gap-3">
      <div className="row">
        {canJoinVideo && <Link href={`/appointments/${a.id}/video`} className={`${sz} btn-primary`}>ورود به ویزیت</Link>}
        {can.confirm && <button className={`${sz} btn-primary`} disabled={!!busy} onClick={() => void run("confirm", "نوبت تأیید شد.")}>تأیید نوبت</button>}
        {can.start && <button className={`${sz} btn-primary`} disabled={!!busy} onClick={() => void run("start", "ویزیت شروع شد.")}>شروع ویزیت</button>}
        {can.complete && <button className={`${sz} btn-primary`} disabled={!!busy} onClick={() => void run("complete", "ویزیت پایان یافت.")}>پایان ویزیت</button>}
        {can.noShow && <button className={sz} disabled={!!busy} onClick={() => void run("report-no-show", "غیبت ثبت شد.")}>{isDoctor ? "ثبت غیبت بیمار" : "گزارش غیبت پزشک"}</button>}
        {can.cancel && <button className={`${sz} btn-danger`} disabled={!!busy} onClick={() => setConfirmCancel(true)}>لغو نوبت</button>}
      </div>
      {!compact && <ErrorBox message={err} />}
      {confirmCancel && (
        <Modal title="لغو نوبت" onClose={() => setConfirmCancel(false)}>
          <p>آیا از لغو این نوبت مطمئن هستید؟</p>
          {isPatient && paid && (
            <div className="note-box">
              طبق سیاست لغو، حدود <strong>{formatNumber(pct)}٪</strong> مبلغ پرداختی بازگردانده می‌شود (مقدار نهایی را سیستم تعیین می‌کند).
            </div>
          )}
          {isDoctor && paid && <div className="note-box">لغو توسط پزشک: مبلغ به‌طور کامل به بیمار بازگردانده می‌شود.</div>}
          <ErrorBox message={err} />
          <div className="row mt-4">
            <button className="btn btn-danger" disabled={!!busy} onClick={() => void run("cancel", "نوبت لغو شد.")}>بله، لغو شود</button>
            <button className="btn btn-ghost" onClick={() => setConfirmCancel(false)}>انصراف</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
