"use client";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useToast } from "@/components/Toast";
import { ErrorBox, Loading, Modal } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/messages";
import type { VerificationItem } from "@/lib/types";

function Verifications() {
  const { api } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<VerificationItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<VerificationItem | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api.get<VerificationItem[]>("/admin/doctor-verifications?status=PENDING")); setErr(null); }
    catch (e) { setErr(errorMessage(e)); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  async function act(v: VerificationItem, action: "approve" | "reject") {
    setBusy(true); setErr(null);
    try {
      await api.post(`/admin/doctor-verifications/${v.id}/${action}`, action === "reject" ? { note } : {});
      toast(action === "approve" ? "پزشک تأیید شد." : "درخواست رد شد.", "ok");
      setRejecting(null); setNote(""); await load();
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  }

  if (!items) return err ? <ErrorBox message={err} /> : <Loading />;
  return (
    <div className="stack">
      <h1>درخواست‌های تأیید پزشک</h1>
      <ErrorBox message={err} />
      {items.length === 0 ? <div className="empty">درخواستی در انتظار بررسی نیست.</div> : items.map((v) => (
        <div key={v.id} className="card row between">
          <div>
            <h3 className="m-0">{v.doctor.fullName}</h3>
            <span className="muted small">شماره‌ی نظام پزشکی: <span className="num">{v.doctor.medicalCouncilNo ?? "—"}</span> · ثبت: {formatDateTime(v.createdAt)}</span>
            <div className="help ltr">{v.documentKey}</div>
          </div>
          <div className="row">
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void act(v, "approve")}>تأیید</button>
            <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => setRejecting(v)}>رد</button>
          </div>
        </div>
      ))}
      {rejecting && (
        <Modal title={`رد درخواست ${rejecting.doctor.fullName}`} onClose={() => setRejecting(null)}>
          <div className="field"><label className="label" htmlFor="note">دلیل (برای پزشک نمایش داده می‌شود)</label>
            <textarea id="note" className="textarea" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div className="row mt-3">
            <button className="btn btn-danger" disabled={busy || note.trim().length < 3} onClick={() => void act(rejecting, "reject")}>رد درخواست</button>
            <button className="btn btn-ghost" onClick={() => setRejecting(null)}>انصراف</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function VerificationsPage() {
  return <RequireAuth roles={["ADMIN"]}><Verifications /></RequireAuth>;
}
