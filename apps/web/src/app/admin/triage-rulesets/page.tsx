"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Alert } from "@/components/design";
import { RequireAuth } from "@/components/RequireAuth";
import { ModuleGate } from "@/components/system/ModuleGate";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/messages";

type Level = "EMERGENCY" | "URGENT" | "ROUTINE";

interface Rule {
  id: string;
  anyOf: string[];
  level: Level;
  explanationFa: string;
}
interface RulesetRow {
  id: string;
  version: string;
  approvedBy: string;
  approvedAt: string;
  ruleCount: number;
  label: string | null;
  valid: boolean;
}
interface Created {
  id: string;
  version: string;
  rules: number;
}
interface Feedback {
  tone: "ok" | "bad";
  title: string;
  text: string;
  issues: string[];
}

const LEVELS: Level[] = ["EMERGENCY", "URGENT", "ROUTINE"];

/** تابع خالص: هر سطر «id|anyOf|LEVEL|explanation» را به قانون تبدیل میکند. */
function parseRules(text: string): { rules: Rule[]; errors: string[] } {
  const rules: Rule[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const lineNo = index + 1;
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length !== 4) {
      errors.push(`خط ${lineNo}: قالب باید id|anyOf|LEVEL|explanation باشد.`);
      return;
    }
    const [id, anyOfRaw, level, explanationFa] = parts as [string, string, string, string];
    const anyOf = anyOfRaw.split(/[,،]/).map((s) => s.trim()).filter(Boolean);
    const validLevel = LEVELS.includes(level as Level);
    if (!id) errors.push(`خط ${lineNo}: شناسهٔ قانون لازم است.`);
    if (anyOf.length === 0) errors.push(`خط ${lineNo}: حداقل یک علامت لازم است.`);
    if (!validLevel) errors.push(`خط ${lineNo}: سطح باید EMERGENCY، URGENT یا ROUTINE باشد.`);
    if (explanationFa.length < 10) errors.push(`خط ${lineNo}: توضیح حداقل ۱۰ نویسه است.`);
    if (id && anyOf.length > 0 && validLevel && explanationFa.length >= 10) {
      rules.push({ id, anyOf, level: level as Level, explanationFa });
    }
  });
  if (rules.length === 0 && errors.length === 0) errors.push("حداقل یک قانون لازم است.");
  return { rules, errors };
}

/** جزئیات اعتبارسنجی بدنهٔ خطا را (در صورت وجود) نمایش میدهد. */
function validationIssues(e: unknown): string[] {
  if (!(e instanceof ApiError)) return [];
  const issues = (e.body as { issues?: unknown } | undefined)?.issues;
  if (!Array.isArray(issues)) return [];
  return issues
    .map((item) => {
      if (typeof item === "string") return item;
      const v = item as { path?: unknown; message?: unknown };
      return [typeof v.path === "string" ? v.path : "", typeof v.message === "string" ? v.message : ""].filter(Boolean).join(": ");
    })
    .filter(Boolean);
}

function AdminRulesetsContent() {
  const { api } = useAuth();
  const [rows, setRows] = useState<RulesetRow[]>([]);
  const [version, setVersion] = useState("");
  const [approvedByLabel, setApprovedByLabel] = useState("");
  const [rulesText, setRulesText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<RulesetRow[]>("/admin/triage-rulesets"));
    } catch (e) {
      setFeedback({ tone: "bad", title: "خطا در بارگذاری فهرست", text: errorMessage(e), issues: [] });
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseRules(rulesText);
    const localIssues = [...parsed.errors];
    if (!/^\d+\.\d+\.\d+$/.test(version.trim())) localIssues.push("نسخه باید به شکل x.y.z باشد.");
    if (approvedByLabel.trim().length < 2) localIssues.push("برچسب تأییدکننده لازم است.");
    if (localIssues.length > 0) {
      setFeedback({ tone: "bad", title: "اشکال در ورودی", text: "", issues: localIssues });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const created = await api.post<Created>("/admin/triage-rulesets", {
        version: version.trim(),
        rules: parsed.rules,
        approvedByLabel: approvedByLabel.trim(),
      });
      setFeedback({
        tone: "ok",
        title: "نسخه ثبت شد",
        text: `نسخهٔ ${created.version} با ${created.rules} قانون ذخیره شد.`,
        issues: [],
      });
      setVersion("");
      setRulesText("");
      await load();
    } catch (err) {
      setFeedback({ tone: "bad", title: "قواعد پذیرفته نشد", text: errorMessage(err), issues: validationIssues(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      {feedback && (
        <Alert tone={feedback.tone} title={feedback.title}>
          {feedback.text && <p className="small m-0">{feedback.text}</p>}
          {feedback.issues.length > 0 && (
            <ul className="small">
              {feedback.issues.map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      <section className="card stack">
        <h2 className="fs-lg m-0">نسخه‌های ثبت‌شده</h2>
        {loading ? (
          <p className="muted small m-0">در حال بارگذاری…</p>
        ) : rows.length === 0 ? (
          <p className="muted small m-0">هنوز نسخهای ثبت نشده است.</p>
        ) : (
          <ul className="prop-chosen">
            {rows.map((row) => (
              <li key={row.id}>
                <strong dir="ltr">{row.version}</strong>
                <span className="muted small">{row.label ?? "بدون برچسب"}</span>
                <span className="muted small">{row.ruleCount} قانون</span>
                <span className="muted small">{row.valid ? "معتبر" : "نامعتبر"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card stack">
        <h2 className="fs-lg m-0">ثبت نسخهٔ جدید</h2>
        <p className="muted small m-0">
          قالب هر سطر: <code dir="ltr">id|anyOf|LEVEL|explanation</code> — علامت‌ها با کاما جدا میشوند و سطح یکی از EMERGENCY، URGENT یا ROUTINE است.
        </p>
        <form className="stack" onSubmit={(e) => void submit(e)} noValidate>
          <div className="stack">
            <label className="label" htmlFor="rt-version">نسخه (x.y.z)</label>
            <input
              id="rt-version"
              className="input"
              dir="ltr"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="1.0.0"
              aria-label="نسخه قواعد به شکل x.y.z"
            />
          </div>
          <div className="stack">
            <label className="label" htmlFor="rt-approver">تأییدکننده</label>
            <input
              id="rt-approver"
              className="input"
              value={approvedByLabel}
              onChange={(e) => setApprovedByLabel(e.target.value)}
              placeholder="کمیتهٔ بالینی"
              aria-label="برچسب تأییدکننده"
            />
          </div>
          <div className="stack">
            <label className="label" htmlFor="rt-rules">قواعد (یک خط در هر قانون)</label>
            <textarea
              id="rt-rules"
              className="input"
              rows={8}
              value={rulesText}
              onChange={(e) => setRulesText(e.target.value)}
              placeholder="chest_pain|درد قفسه سینه,تنگی نفس|EMERGENCY|علائم اورژانسی نیاز به بررسی فوری دارند"
              aria-label="قواعد؛ هر خط id|anyOf|LEVEL|explanation"
            />
          </div>
          <button className="btn btn-primary self-start" type="submit" disabled={busy} aria-label="ثبت نسخه قواعد">
            {busy ? "در حال ثبت…" : "ثبت قواعد"}
          </button>
        </form>
      </section>
    </div>
  );
}

export default function AdminTriageRulesetsPage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <div className="stack">
        <header className="page-head">
          <div>
            <h1>مدیریت قواعد ارزیابی علائم</h1>
            <p className="muted">نسخه‌های مصوب قواعد triage را ثبت و بازبینی کنید</p>
          </div>
        </header>
        <ModuleGate flag="FF_M10_TRIAGE_GOV">
          <AdminRulesetsContent />
        </ModuleGate>
      </div>
    </RequireAuth>
  );
}
