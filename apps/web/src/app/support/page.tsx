"use client";
import { useEffect, useState } from "react";
import { Alert, Badge, EmptyState, FormField } from "@/components/design";
import { RequireAuth } from "@/components/RequireAuth";
import { useToast } from "@/components/Toast";
import { formatDateTime } from "@/lib/format";

interface Ticket { id: string; subject: string; body: string; createdAt: string; status: "OPEN" | "CLOSED" }
const KEY = "nvy-support-tickets";

/** مرکز پشتیبانی دروناپ — تیکت محلی با SLA اطلاعرسانی. */
function Support() {
  const toast = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    try { setTickets(JSON.parse(localStorage.getItem(KEY) ?? "[]") as Ticket[]); } catch { /* ignore */ }
  }, []);
  const persist = (t: Ticket[]) => {
    setTickets(t);
    try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* ignore */ }
  };
  const submit = () => {
    if (!subject.trim() || !body.trim()) return;
    persist([{ id: crypto.randomUUID(), subject, body, createdAt: new Date().toISOString(), status: "OPEN" }, ...tickets]);
    setSubject(""); setBody("");
    toast("تیکت ثبت شد؛ پاسخ در ۲۴ ساعت کاری", "ok");
  };

  return (
    <div className="stack">
      <header className="page-head"><div><h1>پشتیبانی</h1><p className="muted">تیکت بزنید و وضعیت آن را دنبال کنید</p></div></header>
      <Alert tone="info" title="SLA پشتیبانی">تیکتها در ساعتهای کاری ظرف ۲۴ ساعت بررسی میشوند.</Alert>
      <section className="card stack">
        <FormField label="موضوع"><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="مثلاً مشکل در پرداخت" /></FormField>
        <FormField label="توضیحات"><textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)} placeholder="جزئیات مشکل را بنویسید (از ارسال داده سلامت خودداری کنید)" /></FormField>
        <button className="btn btn-primary self-start" type="button" onClick={submit}>ثبت تیکت</button>
      </section>
      <section className="card stack">
        <h2 className="fs-lg m-0">تیکتهای من</h2>
        {tickets.length === 0 ? <EmptyState icon="🎫" title="تیکتی ثبت نشده است" description="در صورت نیاز، تیکت جدیدی ایجاد کنید." /> : (
          <ul className="prop-chosen">
            {tickets.map((t) => (
              <li key={t.id}>
                <strong>{t.subject}</strong>
                <Badge tone={t.status === "OPEN" ? "warn" : "ok"}>{t.status === "OPEN" ? "در بررسی" : "بستهشده"}</Badge>
                <span className="muted small">{formatDateTime(t.createdAt)}</span>
                <button className="btn btn-sm ghost" type="button" onClick={() => persist(tickets.map((x) => x.id === t.id ? { ...x, status: x.status === "OPEN" ? "CLOSED" : "OPEN" } : x))}>
                  {t.status === "OPEN" ? "بستن" : "بازکردن"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function SupportPage() {
  return <RequireAuth><Support /></RequireAuth>;
}
