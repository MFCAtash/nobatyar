"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, StatCard } from "@/components/design";
import { ErrorBox, Loading } from "@/components/ui";
import { ModuleGate } from "@/components/system/ModuleGate";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/messages";

interface FunnelStep {
  step: string;
  count: number;
  conversionFromPrev: number;
}
interface Report {
  funnel: FunnelStep[];
  cohorts: { cohort: string; size: number; retention: number[] }[];
  totalEvents: number;
}
interface Experiment {
  key: string;
  variants: string;
  enabled: boolean;
}

const STEP_LABEL: Record<string, string> = {
  SEARCH: "جستجو",
  SLOT_VIEW: "مشاهدهٔ اسلات",
  SLOT_SELECT: "انتخاب اسلات",
  PAYMENT_START: "شروع پرداخت",
  PAYMENT_SUCCESS: "پرداخت موفق",
  BOOKING_CONFIRMED: "تأیید نوبت",
};

function AnalyticsContent() {
  const { api } = useAuth();
  const [report, setReport] = useState<Report | null>(null);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, e] = await Promise.all([
        api.get<Report>("/admin/analytics/funnel"),
        api.get<Experiment[]>("/admin/analytics/experiments"),
      ]);
      setReport(r);
      setExperiments(e);
    } catch (e) {
      setErr(errorMessage(e));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!report) return err ? <ErrorBox message={err} /> : <Loading />;

  const last = report.funnel[report.funnel.length - 1];
  return (
    <div className="stack">
      {err && <ErrorBox message={err} />}
      <div className="grid grid-3">
        <StatCard label="کل رخدادها" value={String(report.totalEvents)} hint="بدون PHI" />
        <StatCard label="نوبت‌های تأییدشده" value={String(last?.count ?? 0)} hint="کاربران یکتا" tone="ok" />
        <StatCard label="گروه‌های cohort" value={String(report.cohorts.length)} hint="بر اساس هفتهٔ اولین رخداد" />
      </div>

      <section className="card stack">
        <h2 className="fs-lg m-0">فونل رزرو</h2>
        <div className="card">
          <table className="table">
            <thead><tr><th>مرحله</th><th>کاربران</th><th>تبدیل از مرحلهٔ قبل</th></tr></thead>
            <tbody>
              {report.funnel.map((s) => (
                <tr key={s.step}>
                  <td>{STEP_LABEL[s.step] ?? s.step}</td>
                  <td>{s.count}</td>
                  <td>{Math.round(s.conversionFromPrev * 100)}٪</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card stack">
        <h2 className="fs-lg m-0">Cohort / Retention</h2>
        {report.cohorts.length === 0 ? (
          <p className="muted small m-0">داده‌ای موجود نیست.</p>
        ) : (
          <div className="card">
            <table className="table">
              <thead><tr><th>هفته</th><th>افراد</th><th>هفتهٔ ۱</th><th>هفتهٔ ۲</th></tr></thead>
              <tbody>
                {report.cohorts.map((c) => (
                  <tr key={c.cohort}>
                    <td>{c.cohort}</td>
                    <td>{c.size}</td>
                    <td>{Math.round((c.retention[0] ?? 0) * 100)}٪</td>
                    <td>{Math.round((c.retention[1] ?? 0) * 100)}٪</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card stack">
        <h2 className="fs-lg m-0">آزمایش‌های A/B</h2>
        {experiments.length === 0 ? (
          <p className="muted small m-0">آزمایشی تعریف نشده است.</p>
        ) : (
          <ul className="prop-chosen">
            {experiments.map((e) => (
              <li key={e.key}>
                <strong>{e.key}</strong>
                <Badge tone={e.enabled ? "ok" : "info"}>{e.enabled ? "فعال" : "غیرفعال"}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>تحلیل محصول</h1>
          <p className="muted">فونل، cohort و آزمایش‌ها — بدون دادهٔ شناسایی شخصی</p>
        </div>
      </header>
      <ModuleGate flag="FF_M13_PRODUCT_ANALYTICS">
        <AnalyticsContent />
      </ModuleGate>
    </div>
  );
}
