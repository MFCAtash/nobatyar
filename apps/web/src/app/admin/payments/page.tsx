"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { ErrorBox, Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime, formatToman, formatNumber } from "@/lib/format";
import { errorMessage } from "@/lib/messages";
import type { AdminPaymentItem, FinanceSummary } from "@/lib/types";

const PAY: Record<string, string> = { INITIATED: "در انتظار", PAID: "پرداخت‌شده", FAILED: "ناموفق", REFUNDED: "بازپرداخت‌شده", PARTIALLY_REFUNDED: "بازپرداخت جزئی" };

function Payments() {
  const { api } = useAuth();
  const [attention, setAttention] = useState(true);
  const [items, setItems] = useState<AdminPaymentItem[] | null>(null);
  const [sum, setSum] = useState<FinanceSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setItems(null);
    void Promise.all([api.get<AdminPaymentItem[]>(`/admin/payments?attention=${attention}`), api.get<FinanceSummary>("/admin/finance/summary")])
      .then(([l, s]) => { setItems(l); setSum(s); setErr(null); })
      .catch((e) => setErr(errorMessage(e)));
  }, [api, attention]);

  return (
    <div className="stack">
      <div className="row between">
        <h1 className="m-0">پرداخت‌ها</h1>
        <Link href="/admin/refunds" className="btn btn-ghost btn-sm">استرداد وجه</Link>
      </div>
      {sum && (
        <div className="card row gap-5 flex-wrap">
          <span>۲۴ ساعت اخیر: <b className="num">{formatNumber(sum.paidLast24h.count)}</b> پرداخت · {formatToman(sum.paidLast24h.amountRial)}</span>
          <span className={sum.attention.paidUnsynced ? "text-danger" : undefined}>پرداخت‌شده‌ی ناهماهنگ با نوبت: <b className="num">{formatNumber(sum.attention.paidUnsynced)}</b></span>
          <span>INITIATED قدیمی: <b className="num">{formatNumber(sum.attention.staleInitiated)}</b></span>
          <span className={sum.attention.mismatchAttempts ? "text-danger" : undefined}>ناهمخوانی مبلغ: <b className="num">{formatNumber(sum.attention.mismatchAttempts)}</b></span>
        </div>
      )}
      <div className="chips" role="group" aria-label="فیلتر">
        <button className="chip" aria-pressed={attention} onClick={() => setAttention(true)}>نیازمند توجه</button>
        <button className="chip" aria-pressed={!attention} onClick={() => setAttention(false)}>همه (جدیدترین)</button>
      </div>
      <ErrorBox message={err} />
      {!items ? <Loading /> : items.length === 0 ? <div className="empty">موردی نیست.</div> : items.map((p) => (
        <div key={p.id} className="card stack gap-2">
          <div className="row between">
            <b>{formatToman(p.amountRial)}</b>
            <span className="badge badge-info">{PAY[p.status] ?? p.status}</span>
          </div>
          <div className="muted small">
            ثبت: {formatDateTime(p.createdAt)}{p.paidAt ? <> · پرداخت: {formatDateTime(p.paidAt)}</> : null} · درگاه: {p.gateway ?? "—"} · هماهنگ با نوبت: {p.synced ? "بله" : "خیر"}
          </div>
          <div className="muted small">تلاش‌ها: {p.attempts.map((a) => `${a.gateway}:${a.status}${a.failureCode ? `(${a.failureCode})` : ""}`).join("، ") || "—"}</div>
          {p.refunds.length > 0 && <div className="muted small">استردادها: {p.refunds.map((r) => `${formatToman(r.amountRial)} (${r.status})`).join("، ")}</div>}
          <div><Link href={`/appointments/${p.appointmentId}`} className="btn btn-ghost btn-sm">نوبت</Link></div>
        </div>
      ))}
    </div>
  );
}

export default function PaymentsPage() {
  return <RequireAuth roles={["ADMIN"]}><Payments /></RequireAuth>;
}
