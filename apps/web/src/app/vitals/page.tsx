"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, EmptyState, FormField, Sparkline, TrendChart, VitalCard } from "@/components/design";
import { RequireAuth } from "@/components/RequireAuth";
import { useToast } from "@/components/Toast";
import { ErrorBox, Loading } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/messages";
import type { VitalList, VitalType } from "@/lib/types";

const TYPES: { value: VitalType; label: string; second?: boolean; ref: string }[] = [
  { value: "BLOOD_PRESSURE", label: "فشار خون", second: true, ref: "۹۰/۶۰ تا ۱۴۰/۹۰ mmHg" },
  { value: "BLOOD_GLUCOSE", label: "قند خون", ref: "۷۰ تا ۱۴۰ mg/dL" },
  { value: "WEIGHT", label: "وزن", ref: "بسته به قد" },
  { value: "HEART_RATE", label: "ضربان قلب", ref: "۶۰ تا ۱۰۰ bpm" },
  { value: "BODY_TEMPERATURE", label: "دمای بدن", ref: "۳۶٫۱ تا ۳۷٫۲ °C" },
  { value: "OXYGEN_SATURATION", label: "اکسیژن خون", ref: "۹۵ تا ۱۰۰٪" },
];
const ISSUE_FA: Record<string, string> = {
  diastolic_required: "مقدار دیاستولیک را وارد کنید.",
  diastolic_must_be_below_systolic: "دیاستولیک باید کمتر از سیستولیک باشد.",
  secondary_not_allowed: "این نوع اندازهگیری فقط یک مقدار دارد.",
  invalid_measured_at: "زمان اندازهگیری نامعتبر است.",
};
const issueText = (k: string) => ISSUE_FA[k] ?? (k.startsWith("value_primary") ? "مقدار واردشده خارج از بازه معقول است." : "لطفاً ورودی را بررسی کنید.");

function localInput(d = new Date()) {
  const t = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return t.toISOString().slice(0, 16);
}

function Vitals() {
  const { api, me } = useAuth();
  const toast = useToast();
  const [list, setList] = useState<VitalList | null>(null);
  const [type, setType] = useState<VitalType>("BLOOD_PRESSURE");
  const [primary, setPrimary] = useState("");
  const [secondary, setSecondary] = useState("");
  const [measuredAt, setMeasuredAt] = useState(() => localInput());
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setList(await api.get<VitalList>("/vitals?limit=100")); }
    catch (e) { setErr(errorMessage(e)); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null); setIssues([]);
    try {
      await api.post("/vitals", {
        type, valuePrimary: Number(primary),
        ...(secondary ? { valueSecondary: Number(secondary) } : {}),
        measuredAt: new Date(measuredAt).toISOString(), source: "MANUAL",
        ...(note ? { note } : {}),
      });
      toast("اندازهگیری ثبت شد", "ok");
      setPrimary(""); setSecondary(""); setNote("");
      await load();
    } catch (e) {
      const body = (e as ApiError).body as { issues?: string[] } | undefined;
      if (Array.isArray(body?.issues)) setIssues(body.issues.map(issueText));
      else setErr(errorMessage(e));
    } finally { setBusy(false); }
  };

  const sel = TYPES.find((t) => t.value === type)!;
  const values = [...(list?.items ?? [])].reverse().map((v) => v.valuePrimary);
  const typePoints = [...(list?.items ?? [])].reverse().filter((v) => v.type === type).map((v) => ({ label: formatDateTime(v.measuredAt), value: v.valuePrimary }));
  const refNums = sel.ref.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 100];
  const rangeMin = refNums[0] ?? 0, rangeMax = refNums[1] ?? 100;
  return (
    <div className="stack">
      <header className="page-head">
        <div><h1>پایش از راه دور</h1><p className="muted">ثبت و مشاهده اندازهگیریهای فشار خون، قند، وزن و سایر شاخصها</p></div>
      </header>
      <ErrorBox message={err} />
      {issues.length > 0 && <Alert tone="bad" title="لطفاً ورودیها را اصلاح کنید"><ul>{issues.map((i) => <li key={i}>{i}</li>)}</ul></Alert>}

      {me?.role === "PATIENT" && (
        <section className="card">
          <h2 className="fs-lg">ثبت اندازهگیری جدید</h2>
          <form className="stack gap-2" onSubmit={(e) => void submit(e)}>
            <FormField label="نوع اندازهگیری" help={sel.ref}>
              <select value={type} onChange={(e) => { setType(e.target.value as VitalType); setSecondary(""); }}>
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </FormField>
            <div className="row gap-2 wrap">
              <FormField label="مقدار"><input required className="input" type="number" step="any" value={primary} onChange={(e) => setPrimary(e.target.value)} /></FormField>
              {sel.second && <FormField label="دیاستولیک"><input required className="input" type="number" step="any" value={secondary} onChange={(e) => setSecondary(e.target.value)} /></FormField>}
              <FormField label="زمان اندازهگیری"><input required className="input" type="datetime-local" value={measuredAt} onChange={(e) => setMeasuredAt(e.target.value)} /></FormField>
            </div>
            <FormField label="یادداشت (اختیاری)"><input className="input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></FormField>
            <button className="btn btn-primary self-start" disabled={busy} type="submit">{busy ? "در حال ثبت…" : "ثبت"}</button>
          </form>
          <Alert tone="warn" title="این ابزار تشخیصی نیست">هشدارها جایگزین قضاوت پزشک نمیشوند؛ در صورت نگرانی با پزشک تماس بگیرید.</Alert>
        </section>
      )}

      <section className="card mt-4">
        <h2 className="fs-lg">سابقه و روند</h2>
        {!list ? <Loading /> : list.items.length === 0 ? (
          <EmptyState icon="📈" title="اندازهای ثبت نشده است" description="اولین اندازهگیری خود را ثبت کنید تا روند آن نمایش داده شود." />
        ) : (
          <>
            <Sparkline values={values} tone={list.trend.direction === "up" ? "warn" : "info"} />
            <h3 className="fs-md m-0">روند {sel.label}</h3>
            <TrendChart points={typePoints} min={rangeMin} max={rangeMax} />
            <p className="muted small">روند: {list.trend.direction === "up" ? "افزایشی" : list.trend.direction === "down" ? "کاهشی" : "پایدار"}</p>
            <div className="card-grid">
              {list.items.slice(0, 6).map((v) => (
                <VitalCard
                  key={v.id}
                  label={TYPES.find((t) => t.value === v.type)?.label ?? v.type}
                  value={`${v.valuePrimary}${v.valueSecondary !== null ? `/${v.valueSecondary}` : ""}`}
                  unit={v.unit} flag={v.flag} reference={TYPES.find((t) => t.value === v.type)?.ref}
                />
              ))}
            </div>
            <ul className="vital-list">
              {list.items.map((v) => (
                <li key={v.id}>
                  <strong>{TYPES.find((t) => t.value === v.type)?.label}</strong>
                  {me?.role === "DOCTOR" && v.patientName && <span className="muted small">{v.patientName}</span>}
                  <span className="num">{v.valuePrimary}{v.valueSecondary !== null ? `/${v.valueSecondary}` : ""} {v.unit}</span>
                  <span className="muted small">{formatDateTime(v.measuredAt)}</span>
                  {me?.role === "PATIENT" && (
                    <button className="btn ghost small" type="button" onClick={async () => {
                      try { await api.delete(`/vitals/${v.id}`); toast("حذف شد", "ok"); await load(); }
                      catch (e) { setErr(errorMessage(e)); }
                    }}>حذف</button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

export default function VitalsPage() {
  return <RequireAuth><Vitals /></RequireAuth>;
}
