"use client";
import { useCallback, useEffect, useState } from "react";
import { ModuleGate } from "@/components/system/ModuleGate";
import { RequireAuth } from "@/components/RequireAuth";
import { Alert } from "@/components/design";
import { ErrorBox, Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/messages";

interface Rule {
  id: string;
  from: string[];
  action: string;
  actor: string;
  guard: string;
  to?: string;
  compensation: string;
  slaMinutes?: number;
  labelFa: string;
}
interface PolicyResponse {
  aggregate: string;
  version: number;
  rules: Rule[];
  mermaid: string;
  invariants: string[];
}
interface SimResult {
  plan: { ok: boolean; to?: string | null; error?: string | null; ruleId?: string | null };
  rule: Rule | null;
  refund: { percent: number; amountRial: string } | null;
  steps: string[];
}

const ACTIONS = ["CONFIRM", "DOCTOR_CANCEL", "PATIENT_CANCEL", "START", "COMPLETE", "REPORT_PATIENT_NO_SHOW", "REPORT_DOCTOR_NO_SHOW", "EXPIRE", "PAYMENT_SUCCEEDED"];
const STATUSES = ["PENDING_PAYMENT", "PENDING_CONFIRMATION", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED_BY_PATIENT", "CANCELLED_BY_DOCTOR", "EXPIRED", "NO_SHOW_PATIENT", "NO_SHOW_DOCTOR"];

function PolicyContent() {
  const { api } = useAuth();
  const [policy, setPolicy] = useState<PolicyResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [action, setAction] = useState("PATIENT_CANCEL");
  const [from, setFrom] = useState("CONFIRMED");
  const [autoConfirm, setAutoConfirm] = useState(false);
  const [paidRial, setPaidRial] = useState("");
  const [result, setResult] = useState<SimResult | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setPolicy(await api.get<PolicyResponse>("/admin/policies")); }
    catch (e) { setErr(errorMessage(e)); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  const simulate = async () => {
    setBusy(true); setErr(null);
    try {
      const startsAt = new Date(Date.now() + 6 * 60 * 60_000);
      const r = await api.post<SimResult>("/admin/policies/simulate", {
        action, from, startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + 20 * 60_000).toISOString(),
        autoConfirm, ...(paidRial ? { paidRial } : {}),
      });
      setResult(r);
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  };

  if (!policy) return err ? <ErrorBox message={err} /> : <Loading />;

  return (
    <div className="stack">
      <header className="page-head">
        <div><h1>ماشین وضعیت نوبت</h1><p className="muted">نسخهٔ {policy.version} — قواعد قابل شبیهسازی</p></div>
      </header>
      {policy.invariants.length > 0 && <Alert tone="bad" title="قواعد ناسالم">{policy.invariants.join("، ")}</Alert>}

      <section className="card">
        <h2 className="fs-lg">نمای انتقالها</h2>
        <pre className="ws-pre-wrap" dir="ltr">{policy.mermaid}</pre>
      </section>

      <section className="card">
        <h2 className="fs-lg">قواعد</h2>
        <div className="ds-table-wrap">
          <table className="table">
            <thead><tr><th>اقدام</th><th>از</th><th>به</th><th>نقش</th><th>شرط</th><th>جبران</th><th>SLA</th></tr></thead>
            <tbody>
              {policy.rules.map((r) => (
                <tr key={r.id}>
                  <td>{r.labelFa}</td><td dir="ltr">{r.from.join(" | ")}</td><td dir="ltr">{r.to ?? "پویا"}</td>
                  <td>{r.actor}</td><td dir="ltr">{r.guard}</td><td>{r.compensation}</td><td>{r.slaMinutes ? `${Math.round(r.slaMinutes / 60)}h` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card stack">
        <h2 className="fs-lg">شبیهساز انتقال</h2>
        <ErrorBox message={err} />
        <div className="row gap-2 wrap">
          <label>وضعیت فعلی
            <select value={from} onChange={(e) => setFrom(e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          </label>
          <label>اقدام
            <select value={action} onChange={(e) => setAction(e.target.value)}>{ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}</select>
          </label>
          <label>مبلغ پرداخت‌شده (ریال)
            <input inputMode="numeric" value={paidRial} onChange={(e) => setPaidRial(e.target.value)} placeholder="اختیاری" />
          </label>
          <label className="row"><input type="checkbox" checked={autoConfirm} onChange={(e) => setAutoConfirm(e.target.checked)} /> تأیید خودکار پزشک</label>
        </div>
        <button className="btn btn-primary self-start" disabled={busy} onClick={() => void simulate()}>شبیهسازی</button>
        {result && (
          <div className="note-box">
            <strong>نتیجه: {result.plan.ok ? `انتقال به ${result.plan.to}` : `رد شد (${result.plan.error})`}</strong>
            <ol>{result.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          </div>
        )}
      </section>
    </div>
  );
}

export default function PoliciesPage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <ModuleGate flag="FF_M2_STATE_POLICY" fallback={<div className="empty">این قابلیت فعال نیست.</div>}>
        <PolicyContent />
      </ModuleGate>
    </RequireAuth>
  );
}
