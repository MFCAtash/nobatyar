"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/design";
import { ErrorBox, Loading } from "@/components/ui";
import { ModuleGate } from "@/components/system/ModuleGate";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/messages";

interface Rule {
  id: string;
  anyOf: string[];
  level: "EMERGENCY" | "URGENT" | "ROUTINE";
  explanationFa: string;
}
interface ActiveResponse {
  version: string;
  approvedAt: string;
  ruleset: { version: string; approvedByLabel: string; rules: Rule[] };
}
interface Evaluation {
  level: "EMERGENCY" | "URGENT" | "ROUTINE";
  matched: string[];
  explanationFa: string;
  emergencyNoticeFa: string;
}

const LEVEL_LABEL: Record<Evaluation["level"], string> = {
  EMERGENCY: "اورژانسی",
  URGENT: "فوری",
  ROUTINE: "روتین",
};

function TriageContent() {
  const { api } = useAuth();
  const [active, setActive] = useState<ActiveResponse | null>(null);
  const [symptoms, setSymptoms] = useState("");
  const [result, setResult] = useState<Evaluation | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setActive(await api.get<ActiveResponse | null>("/triage-governance/rulesets/active"));
    } catch (e) {
      setErr(errorMessage(e));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const evaluate = async () => {
    setBusy(true);
    setErr(null);
    try {
      const list = symptoms.split(/[,،\n]/).map((s) => s.trim()).filter(Boolean);
      setResult(await api.post<Evaluation>("/triage-governance/evaluate", { symptoms: list }));
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!active && !err) return <Loading />;

  return (
    <div className="stack">
      {err && <ErrorBox message={err} />}
      {!active ? (
        <div className="card">نسخهٔ فعال قواعد triage وجود ندارد؛ ارزیابی تا تأیید ادمین غیرفعال است.</div>
      ) : (
        <section className="card stack">
          <div className="row between">
            <h2 className="fs-lg m-0">قواعد فعال</h2>
            <Badge tone="ok">نسخه {active.version}</Badge>
          </div>
          <p className="muted small m-0">مرجع: {active.ruleset.approvedByLabel}</p>
          <ul className="prop-chosen">
            {active.ruleset.rules.map((r) => (
              <li key={r.id}>
                <strong>{LEVEL_LABEL[r.level]}</strong>
                <span className="muted small">{r.anyOf.join("، ")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card stack">
        <h2 className="fs-lg m-0">ارزیابی علائم</h2>
        <textarea
          className="input"
          rows={3}
          value={symptoms}
          onChange={(e) => setSymptoms(e.target.value)}
          placeholder="علائم را با کاما جدا کنید: درد قفسه سینه، تنگی نفس شدید"
          aria-label="علائم"
        />
        <button className="btn btn-primary self-start" type="button" disabled={busy || !symptoms.trim()} onClick={() => void evaluate()}>
          {busy ? "در حال ارزیابی…" : "ارزیابی"}
        </button>
        {result && (
          <div className={`alert ${result.level === "EMERGENCY" ? "alert-bad" : result.level === "URGENT" ? "alert-warn" : "alert-info"}`}>
            <strong>سطح: {LEVEL_LABEL[result.level]}</strong>
            <p className="m-0">{result.explanationFa}</p>
            <p className="m-0 small">{result.emergencyNoticeFa}</p>
          </div>
        )}
        <p className="muted small m-0">این ارزیابی غیرتشخیصی است و جایگزین پزشک یا اورژانس نیست.</p>
      </section>
    </div>
  );
}

export default function TriageRulesetPage() {
  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>قواعد ارزیابی علائم</h1>
          <p className="muted">نسخهٔ مصوب، توضیح‌پذیر و غیرتشخیصی</p>
        </div>
      </header>
      <ModuleGate flag="FF_M10_TRIAGE_GOV">
        <TriageContent />
      </ModuleGate>
    </div>
  );
}
