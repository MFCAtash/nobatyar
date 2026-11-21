"use client";
import { useState } from "react";
import { RX_FORM_FA, RX_STATUS_UI } from "@/lib/clinical";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime, formatNumber } from "@/lib/format";
import { errorMessage } from "@/lib/messages";
import type { Prescription } from "@/lib/types";
import { useToast } from "./Toast";
import { ErrorBox, Modal } from "./ui";

export function PrescriptionCard({ p, canCancel = false, onChanged }: { p: Prescription; canCancel?: boolean; onChanged?: () => void }) {
  const { api } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const st = RX_STATUS_UI[p.status];

  async function cancel() {
    setBusy(true); setErr(null);
    try { await api.post(`/prescriptions/${p.id}/cancel`, { reason }); toast("نسخه باطل شد.", "ok"); setOpen(false); onChanged?.(); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  }
  return (
    <article className="card stack rx-print" aria-label={`نسخه ${p.number}`}>
      <div className="row between">
        <strong className="ltr num">{p.number}</strong>
        <span className={`badge badge-${st.tone}`}>{st.text}</span>
      </div>
      <div className="muted small">پزشک: {p.doctor.fullName} — صدور: {formatDateTime(p.issuedAt)} — اعتبار تا: {formatDateTime(p.validUntil)}</div>
      <ol className="stack list-inset m-0 gap-2">
        {p.items.map((it, i) => (
          <li key={i}>
            <strong>{it.drugName}</strong> {it.strength && <span className="ltr">{it.strength}</span>} {it.form && <span className="muted small">({RX_FORM_FA[it.form] ?? it.form})</span>}
            <div>{it.dose}، {it.frequency}، {formatNumber(it.durationDays)} روز — تعداد {formatNumber(it.quantity)}</div>
            {it.instructions && <div className="muted small">{it.instructions}</div>}
          </li>
        ))}
      </ol>
      {p.verifyCode && p.status === "ACTIVE" && <div className="note-box">کد راستی‌آزمایی داروخانه: <strong className="ltr num">{p.verifyCode}</strong> (به همراه شماره‌ی نسخه)</div>}
      {p.allergyWarningAcknowledged && <div className="help">هنگام صدور، هشدار حساسیت دارویی توسط پزشک تأیید شده است.</div>}
      <div className="row no-print">
        <button className="btn btn-sm" onClick={() => window.print()}>چاپ</button>
        {canCancel && p.status === "ACTIVE" && <button className="btn btn-sm btn-danger" onClick={() => setOpen(true)}>ابطال</button>}
      </div>
      {open && (
        <Modal title="ابطال نسخه" onClose={() => setOpen(false)}>
          <p>ابطال قابل بازگشت نیست؛ در صورت نیاز نسخه‌ی جدید صادر کنید. دلیل ابطال برای بیمار نمایش داده نمی‌شود.</p>
          <textarea aria-label="دلیل ابطال" className="textarea" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          <ErrorBox message={err} />
          <div className="row mt-3"><button className="btn btn-danger" disabled={busy || reason.trim().length < 5} onClick={() => void cancel()}>ابطال شود</button><button className="btn btn-ghost" onClick={() => setOpen(false)}>انصراف</button></div>
        </Modal>
      )}
    </article>
  );
}
