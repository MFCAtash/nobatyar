"use client";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useToast } from "@/components/Toast";
import { ConsentPanel } from "@/components/ConsentPanel";
import { ErrorBox, Loading, Modal } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/messages";
import type { DataRequest } from "@/lib/types";

function Privacy() {
  const { api, me } = useAuth();
  const toast = useToast();
  const [requests, setRequests] = useState<DataRequest[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState("");

  const load = useCallback(async () => {
    try { setRequests(await api.get<DataRequest[]>("/me/data-requests")); }
    catch (e) { setErr(errorMessage(e)); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  const downloadFhir = async () => {
    setBusy(true); setErr(null);
    try {
      const bundle = await api.get<unknown>("/me/health-record/fhir");
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/fhir+json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "nobatyar-health-record.fhir.json"; a.click();
      URL.revokeObjectURL(url);
      toast("خروجی FHIR دانلود شد", "ok");
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const request = async (type: "EXPORT" | "DELETE") => {
    setBusy(true); setErr(null);
    try {
      await api.post("/me/data-requests", { type });
      toast(type === "DELETE" ? "درخواست حذف ثبت شد" : "درخواست خروجی ثبت شد", "ok");
      await load();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  };

  if (me?.role !== "PATIENT") return <div className="empty">این صفحه برای بیماران است.</div>;

  return (
    <div className="stack">
      <header className="page-head"><div><h1>حریم خصوصی و پرونده قابل حمل</h1><p className="muted">خروجی استاندارد FHIR و حق حذف/خروجی داده</p></div></header>
      <ErrorBox message={err} />

      <ConsentPanel />

      <section className="card mt-4">
        <h2 className="fs-lg">دریافت پرونده سلامت (FHIR R4)</h2>
        <p className="muted">پرونده شامل اندازهگیریها، تشخیصهای تأییدشده، داروها، حساسیتها و فهرست مدارک است. فقط با رضایت فعال پردازش داده سلامت قابل دریافت است.</p>
        <button className="btn btn-primary" disabled={busy} type="button" onClick={() => void downloadFhir()}>{busy ? "در حال تهیه…" : "دانلود خروجی FHIR"}</button>
      </section>

      <section className="card mt-4">
        <h2 className="fs-lg">درخواستها</h2>
        <p className="muted small">درخواست خروجی کامل (JSON) یا حذف؛ پس از بررسی توسط تیم انطباق اجرا میشود.</p>
        <div className="row gap-2 wrap">
          <button className="btn" disabled={busy} type="button" onClick={() => void request("EXPORT")}>درخواست خروجی کامل</button>
          <button className="btn ghost" disabled={busy} type="button" onClick={() => setConfirmDelete(true)}>درخواست حذف داده</button>
        </div>
        {!requests ? <Loading /> : requests.length === 0 ? <p className="muted">درخواستی ثبت نشده است.</p> : (
          <ul className="vital-list">
            {requests.map((r) => (
              <li key={r.id}>
                <strong>{r.type === "EXPORT" ? "خروجی" : "حذف"}</strong>
                <span className="badge">{r.status}</span>
                <span className="muted small">{formatDateTime(r.requestedAt)}</span>
                {r.status === "PENDING" && (
                  <button className="btn ghost small" type="button" onClick={async () => {
                    try { await api.post(`/me/data-requests/${r.id}/cancel`); toast("لغو شد", "ok"); await load(); }
                    catch (e) { setErr(errorMessage(e)); }
                  }}>لغو</button>
                )}
                {r.type === "EXPORT" && r.status === "COMPLETED" && (
                  <button className="btn small" type="button" onClick={async () => {
                    try {
                      const u = await api.get<{ url: string }>(`/me/data-requests/${r.id}/download`);
                      window.location.href = u.url;
                    } catch (e) { setErr(errorMessage(e)); }
                  }}>دانلود خروجی</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {confirmDelete && (
        <Modal title="تأیید درخواست حذف داده" onClose={() => { setConfirmDelete(false); setTyped(""); }}>
          <p>حذف داده سلامت غیرقابل بازگشت است. درخواست شما پس از تأیید دو ادمین و یک دورهٔ ۳۰روزه اجرا میشود و تا آن زمان قابل لغو است.</p>
          <p className="muted small">سوابق مالی و زنجیره ممیزی طبق الزام قانونی نگهداری میشوند.</p>
          <label>برای تأیید عبارت «حذف داده» را بنویسید
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </label>
          <div className="row gap-2 mt-3">
            <button className="btn btn-primary" disabled={typed.trim() !== "حذف داده"} type="button" onClick={() => {
              setConfirmDelete(false); setTyped(""); void request("DELETE");
            }}>ثبت درخواست حذف</button>
            <button className="btn ghost" type="button" onClick={() => { setConfirmDelete(false); setTyped(""); }}>انصراف</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function PrivacyPage() {
  return <RequireAuth><Privacy /></RequireAuth>;
}
