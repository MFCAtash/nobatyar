"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, EmptyState } from "@/components/design";
import { ErrorBox, Loading } from "@/components/ui";
import { ModuleGate } from "@/components/system/ModuleGate";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/messages";
import { formatDateTime } from "@/lib/format";

type Kind = "WEIGHT" | "BP" | "GLUCOSE" | "LAB";

interface Point {
  id: string;
  kind: Kind;
  at: string;
  primary: number;
  secondary?: number;
  unit: string;
}
interface TimelineResponse {
  points: Point[];
  trends: Record<Kind, { count: number; latest: number | null; direction: string }>;
}
interface MedicationItem {
  name: string;
  dose?: string;
}
interface MedicationsResponse {
  items: MedicationItem[];
  warnings: { a: string; b: string; severity: string; messageFa: string }[];
}

const KIND_LABEL: Record<Kind, string> = { WEIGHT: "وزن", BP: "فشار خون", GLUCOSE: "قند خون", LAB: "آزمایش" };

function RecordContent() {
  const { api } = useAuth();
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);
  const [meds, setMeds] = useState<MedicationsResponse | null>(null);
  const [kind, setKind] = useState<Kind>("WEIGHT");
  const [value, setValue] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, m] = await Promise.all([
        api.get<TimelineResponse>("/me/health/timeline"),
        api.get<MedicationsResponse>("/me/health/medications"),
      ]);
      setTimeline(t);
      setMeds(m);
    } catch (e) {
      setErr(errorMessage(e));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    setBusy(true);
    setErr(null);
    setNotice(null);
    try {
      await api.post("/me/health/timeline", { kind, value });
      setValue("");
      setNotice("اندازه‌گیری ثبت شد.");
      await load();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const exportRecord = async () => {
    setBusy(true);
    setErr(null);
    setNotice(null);
    try {
      const r = await api.post<{ filename: string; envelope: unknown }>("/me/health/export", { passphrase });
      const blob = new Blob([JSON.stringify(r.envelope)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
      setNotice("خروجی رمزشده دانلود شد؛ عبارت عبور را نگه دارید.");
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!timeline) return err ? <ErrorBox message={err} /> : <Loading />;

  return (
    <div className="stack">
      {err && <ErrorBox message={err} />}
      {notice && <div className="card">{notice}</div>}

      <section className="card stack">
        <h2 className="fs-lg m-0">ثبت اندازه‌گیری</h2>
        <div className="row gap-2">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="نوع">
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          <input className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === "BP" ? "120/80" : "مثلاً 72.5"} aria-label="مقدار" />
          <button className="btn btn-primary" type="button" disabled={busy || !value.trim()} onClick={() => void add()}>ثبت</button>
        </div>
        <p className="muted small m-0">این اعداد جایگزین تشخیص پزشک نیستند و فقط برای پیگیری روند شما ذخیره می‌شوند.</p>
      </section>

      <section className="card stack">
        <h2 className="fs-lg m-0">روندها</h2>
        <div className="row gap-2 wrap">
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => {
            const t = timeline.trends[k];
            return (
              <div key={k} className="card stack">
                <span className="muted small">{KIND_LABEL[k]}</span>
                <strong className="fs-lg">{t.latest ?? "—"}</strong>
                <Badge tone={t.direction === "flat" ? "info" : t.direction === "unknown" ? "warn" : "ok"}>{t.count} نقطه</Badge>
              </div>
            );
          })}
        </div>
        {timeline.points.length === 0 ? (
          <EmptyState title="هنوز اندازه‌گیری‌ای ثبت نشده" description="اولین وزن یا فشار خود را ثبت کنید." />
        ) : (
          <div className="card">
            <table className="table">
              <thead><tr><th>نوع</th><th>مقدار</th><th>زمان</th></tr></thead>
              <tbody>
                {timeline.points.slice(-20).reverse().map((p) => (
                  <tr key={p.id}>
                    <td>{KIND_LABEL[p.kind]}</td>
                    <td>{p.secondary !== undefined ? `${p.primary}/${p.secondary}` : p.primary} {p.unit}</td>
                    <td>{formatDateTime(p.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card stack">
        <h2 className="fs-lg m-0">داروها</h2>
        {meds && meds.items.length > 0 ? (
          <ul className="prop-chosen">
            {meds.items.map((m) => <li key={m.name}><strong>{m.name}</strong>{m.dose ? <span className="muted small">{m.dose}</span> : null}</li>)}
          </ul>
        ) : (
          <p className="muted small m-0">دارویی ثبت نشده است.</p>
        )}
        {meds?.warnings.map((w) => (
          <div key={`${w.a}-${w.b}`} className="card">{w.messageFa}</div>
        ))}
      </section>

      <section className="card stack">
        <h2 className="fs-lg m-0">خروجی رمزشدهٔ پرونده</h2>
        <p className="muted small m-0">خروجی با عبارت عبور شما رمز می‌شود؛ سرور کلید را نگه نمی‌دارد. حداقل ۱۲ کاراکتر.</p>
        <div className="row gap-2">
          <input className="input" type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder="عبارت عبور قوی" aria-label="عبارت عبور" />
          <button className="btn btn-primary" type="button" disabled={busy || passphrase.length < 12} onClick={() => void exportRecord()}>دانلود خروجی</button>
        </div>
      </section>
    </div>
  );
}

export default function HealthRecordPage() {
  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>پروندهٔ سلامت من</h1>
          <p className="muted">تایم‌لاین، داروها و خروجی امن</p>
        </div>
      </header>
      <ModuleGate flag="FF_M9_PATIENT_RECORD">
        <RecordContent />
      </ModuleGate>
    </div>
  );
}
