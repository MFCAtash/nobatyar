"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, EmptyState } from "@/components/design";
import { ErrorBox, Loading } from "@/components/ui";
import { ModuleGate } from "@/components/system/ModuleGate";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/messages";

interface Clinic {
  id: string;
  name: string;
  addressFa: string;
  phone: string;
  geoLat: number | null;
  geoLng: number | null;
  verified: boolean;
  distanceKm: number | null;
}
type Dashboard = "CLINIC" | "TELEHEALTH" | "RESEARCH";

function GrowthContent() {
  const { api, me } = useAuth();
  const [clinics, setClinics] = useState<Clinic[] | null>(null);
  const [query, setQuery] = useState("");
  const [dashboard, setDashboard] = useState<Dashboard>("TELEHEALTH");
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const qs = query.trim() ? `?q=${encodeURIComponent(query.trim())}&verifiedOnly=1` : "?verifiedOnly=1";
      setClinics(await api.get<Clinic[]>(`/clinics${qs}`));
    } catch (e) {
      setErr(errorMessage(e));
    }
  }, [api, query]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (me?.role !== "DOCTOR") return;
    void (async () => {
      try {
        setDashboard((await api.get<{ dashboard: Dashboard }>("/me/workspace")).dashboard);
      } catch {
        // عدم دسترسی به فضای کاری پزشک مانع نمایش فهرست کلینیک‌ها نمی‌شود.
      }
    })();
  }, [api, me?.role]);

  const saveWorkspace = async () => {
    setBusy(true);
    setErr(null);
    setNotice(null);
    try {
      await api.put("/me/workspace", { dashboard });
      setNotice("داشبورد کاری ذخیره شد.");
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!clinics) return err ? <ErrorBox message={err} /> : <Loading />;

  return (
    <div className="stack">
      {err && <ErrorBox message={err} />}
      {notice && <div className="card">{notice}</div>}

      {me?.role === "DOCTOR" && (
        <section className="card stack">
          <h2 className="fs-lg m-0">داشبورد کاری من</h2>
          <div className="row gap-2">
            <select className="input" value={dashboard} onChange={(e) => setDashboard(e.target.value as Dashboard)} aria-label="داشبورد">
              <option value="CLINIC">کلینیک</option>
              <option value="TELEHEALTH">ویزیت آنلاین</option>
              <option value="RESEARCH">پژوهش</option>
            </select>
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void saveWorkspace()}>ذخیره</button>
          </div>
        </section>
      )}

      <section className="card stack">
        <h2 className="fs-lg m-0">کلینیک‌های تأییدشده</h2>
        <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجوی نام یا آدرس" aria-label="جستجو" />
        {clinics.length === 0 ? (
          <EmptyState title="کلینیکی یافت نشد" description="عبارت دیگری را امتحان کنید." />
        ) : (
          <ul className="prop-chosen">
            {clinics.map((c) => (
              <li key={c.id}>
                <strong>{c.name} <Badge tone="ok">تأییدشده</Badge></strong>
                <span className="muted small">{c.addressFa} · {c.phone}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function ClinicsPage() {
  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>اکوسیستم کلینیک‌ها</h1>
          <p className="muted">دایرکتوری تأییدشده و فضای کاری پزشک</p>
        </div>
      </header>
      <ModuleGate flag="FF_M14_ECOSYSTEM">
        <GrowthContent />
      </ModuleGate>
    </div>
  );
}
