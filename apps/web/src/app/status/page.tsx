"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ErrorBox, Loading } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/messages";
import type { ComponentStatus, StatusSnapshot } from "@/lib/types";

const LABEL: Record<ComponentStatus, string> = {
  operational: "عملیاتی", degraded: "کاهش عملکرد", outage: "قطع سرویس",
};
const CLASS: Record<ComponentStatus, string> = {
  operational: "status-ok", degraded: "status-warn", outage: "status-bad",
};

/** صفحه وضعیت عمومی — نیازی به ورود ندارد؛ endpoint ی /status عمومی است. */
export default function StatusPage() {
  const [data, setData] = useState<StatusSnapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/status", { cache: "no-store", headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData((await r.json()) as StatusSnapshot);
      setErr(null);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>وضعیت سامانه</h1>
          <p className="muted">وضعیت لحظهای سرویسها و حوادث عمومی نوبتیار</p>
        </div>
        <Link href="/" className="btn ghost">بازگشت</Link>
      </header>

      {loading && <Loading />}
      <ErrorBox message={err} />

      {data && (
        <>
          <section className={`card status-overall ${CLASS[data.overall]}`} aria-live="polite">
            <span className="status-dot" aria-hidden="true" />
            <div>
              <strong>{data.overall === "operational" ? "همه سرویسها عملیاتیاند" : LABEL[data.overall]}</strong>
              <p className="muted">آخرین بهروزرسانی: {formatDateTime(data.updatedAt)}</p>
            </div>
            <button className="btn ghost" onClick={() => void load()} type="button">تازهسازی</button>
          </section>

          <section className="card-grid" aria-label="وضعیت اجزا">
            {data.components.map((c) => (
              <article className="card" key={c.id}>
                <h3>{c.nameFa}</h3>
                <span className={`badge ${CLASS[c.status]}`}>{LABEL[c.status]}</span>
              </article>
            ))}
          </section>

          <section className="card mt-4">
            <h2>حوادث اخیر</h2>
            {data.incidents.length === 0 ? (
              <p className="muted">هیچ حادثهای ثبت نشده است.</p>
            ) : (
              <ul className="timeline">
                {data.incidents.map((i) => (
                  <li key={i.id}>
                    <strong>{i.titleFa}</strong> — <span className="muted">{i.impact} / {i.status}</span>
                    <div className="muted">از {formatDateTime(i.startedAt)}{i.resolvedAt ? ` تا ${formatDateTime(i.resolvedAt)}` : ""}</div>
                    {i.updates.map((u, n) => <p key={n}>{u.bodyFa} <span className="muted">({formatDateTime(u.at)})</span></p>)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
