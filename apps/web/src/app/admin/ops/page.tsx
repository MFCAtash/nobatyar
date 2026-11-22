"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, StatCard } from "@/components/design";
import { ErrorBox, Loading } from "@/components/ui";
import { ModuleGate } from "@/components/system/ModuleGate";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/messages";

interface Slo {
  service: string;
  objective: number;
  burnRate: number;
  window: string;
  remainingBudgetPct: number;
  severity: "ok" | "ticket" | "page" | "rollback";
}
interface Drill {
  id: string;
  target: string;
  result: string;
  at: string;
}

const TARGETS = ["redis", "postgres-replica", "payment-gateway", "sms-provider", "livekit"];
const SEVERITY_LABEL: Record<Slo["severity"], string> = {
  ok: "عادی", ticket: "تیکت", page: "صفحه تماس", rollback: "بازگشت خودکار",
};

function OpsContent() {
  const { api } = useAuth();
  const [slos, setSlos] = useState<Slo[] | null>(null);
  const [drills, setDrills] = useState<Drill[]>([]);
  const [target, setTarget] = useState(TARGETS[0]);
  const [approved, setApproved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([
        api.get<Slo[]>("/admin/slo"),
        api.get<Drill[]>("/admin/chaos"),
      ]);
      setSlos(s);
      setDrills(d);
    } catch (e) {
      setErr(errorMessage(e));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async () => {
    setBusy(true);
    setErr(null);
    setNotice(null);
    try {
      await api.post(`/admin/chaos/${target}`, { approved });
      setNotice(" drill ثبت شد؛ بازگشت خودکار درپایان تضمین است.");
      await load();
    } catch (e) {
      setErr(errorMessage(e));
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!slos) return err ? <ErrorBox message={err} /> : <Loading />;

  return (
    <div className="stack">
      {err && <ErrorBox message={err} />}
      {notice && <div className="card">{notice}</div>}
      <div className="grid grid-3">
        {slos.length === 0 ? <StatCard label="SLO" value="—" hint="تعریف نشده" /> : slos.map((s) => (
          <StatCard
            key={s.service}
            label={s.service}
            value={`${s.objective}%`}
            hint={`بودجه باقی: ${s.remainingBudgetPct}٪`}
            tone={s.severity === "rollback" ? "bad" : s.severity === "page" ? "warn" : "ok"}
          />
        ))}
      </div>

      <section className="card stack">
        <h2 className="fs-lg m-0"> وضعیت SLO</h2>
        {slos.map((s) => (
          <div className="row between" key={s.service}>
            <span>{s.service} · burn={s.burnRate}</span>
            <Badge tone={s.severity === "ok" ? "ok" : "warn"}>{SEVERITY_LABEL[s.severity]}</Badge>
          </div>
        ))}
      </section>

      <section className="card stack">
        <h2 className="fs-lg m-0">Chaos drill</h2>
        <p className="muted small m-0">در production غیرفعال؛ اجرا فقط با تأیید صریح و بازگشت خودکار.</p>
        <div className="row gap-2 wrap">
          <select className="input" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="هدف">
            {TARGETS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <label className="row gap-2">
            <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
            <span>تأیید میکنم</span>
          </label>
          <button className="btn btn-primary" type="button" disabled={!approved || busy} onClick={() => void run()}>اجرا</button>
        </div>
        {drills.length === 0 ? (
          <p className="muted small m-0"> drills قبلی وجود ندارد.</p>
        ) : (
          <ul className="prop-chosen">
            {drills.slice(0, 10).map((d) => <li key={d.id}><strong>{d.target}</strong><span className="muted small">{d.result}</span></li>)}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function OpsPage() {
  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>عملیات خودمختار</h1>
          <p className="muted">SLO، بودجهٔ خطا و تمرین‌های chaos</p>
        </div>
      </header>
      <ModuleGate flag="FF_M11_AUTO_OPS">
        <OpsContent />
      </ModuleGate>
    </div>
  );
}
