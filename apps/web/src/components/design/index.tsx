import type { ReactNode } from "react";

/** سیستم طراحی فاز ۲۰ — کامپوننتهای بدون وابستگی خارجی و کاملاً RTL. */

export function Alert({ tone = "info", title, children }: { tone?: "info" | "ok" | "warn" | "bad"; title: string; children?: ReactNode }) {
  const icon = { info: "ℹ️", ok: "✅", warn: "⚠️", bad: "⛔" }[tone];
  return (
    <div className={`ds-alert ds-alert-${tone}`} role={tone === "bad" ? "alert" : "status"}>
      <span aria-hidden="true">{icon}</span>
      <div><strong>{title}</strong>{children && <div className="ds-alert-body">{children}</div>}</div>
    </div>
  );
}

export function Badge({ tone = "info", children }: { tone?: "info" | "ok" | "warn" | "bad"; children: ReactNode }) {
  return <span className={`ds-badge ds-badge-${tone}`}>{children}</span>;
}

export function StatCard({ label, value, hint, tone = "info" }: { label: string; value: string; hint?: string; tone?: "info" | "ok" | "warn" | "bad" }) {
  return (
    <article className={`ds-stat ds-stat-${tone}`}>
      <span className="ds-stat-label">{label}</span>
      <strong className="ds-stat-value num">{value}</strong>
      {hint && <span className="ds-stat-hint muted">{hint}</span>}
    </article>
  );
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="ds-stepper" aria-label="مراحل">
      {steps.map((s, i) => (
        <li key={s} className={`ds-step ${i < current ? "done" : i === current ? "active" : "todo"}`} aria-current={i === current ? "step" : undefined}>
          <span className="ds-step-dot" aria-hidden="true">{i < current ? "✓" : i + 1}</span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

export function Sparkline({ values, height = 48, tone = "info" }: { values: number[]; height?: number; tone?: "info" | "ok" | "warn" | "bad" }) {
  if (values.length < 2) return <div className="ds-spark-empty muted">داده کافی برای روند وجود ندارد</div>;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 120},${36 - ((v - min) / span) * 30}`).join(" ");
  return (
    <svg className={`ds-spark ds-spark-${tone}`} viewBox="0 0 120 40" width="100%" height={height} role="img" aria-label={`روند: ${values[0]} تا ${values[values.length - 1]}`}>
      <polyline points={pts} fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function EmptyState({ icon = "📭", title, description, action }: { icon?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="ds-empty">
      <span className="ds-empty-icon" aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      {description && <p className="muted">{description}</p>}
      {action}
    </div>
  );
}

export function FormField({ label, help, error, children, htmlFor }: { label: string; help?: string; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="ds-field">
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className="ds-field-error" role="alert">{error}</span> : help ? <span className="help">{help}</span> : null}
    </div>
  );
}

export function VitalCard({ label, value, unit, flag, reference }: { label: string; value: string; unit: string; flag?: "normal" | "watch" | "alert"; reference?: string }) {
  const tone = flag === "alert" ? "bad" : flag === "watch" ? "warn" : "ok";
  return (
    <article className={`ds-vital ds-vital-${tone}`}>
      <span className="muted small">{label}</span>
      <strong className="num ds-vital-value">{value} <small>{unit}</small></strong>
      {reference && <span className="ds-vital-ref muted small">بازه معمول: {reference}</span>}
      <Badge tone={tone}>{flag === "alert" ? "هشدار" : flag === "watch" ? "نیاز به بررسی" : "طبیعی"}</Badge>
    </article>
  );
}

/** نمودار روند پیشرفته: نوار بازه طبیعی، خط روند و tooltip بومی SVG. */
export function TrendChart({ points, min, max, height = 140 }: { points: { label: string; value: number }[]; min: number; max: number; height?: number }) {
  if (points.length < 2) return <div className="ds-spark-empty muted">داده کافی برای ترسیم روند وجود ندارد</div>;
  const lo = Math.min(min, ...points.map((p) => p.value)) - 5;
  const hi = Math.max(max, ...points.map((p) => p.value)) + 5;
  const y = (v: number) => 100 - ((v - lo) / (hi - lo || 1)) * 90 - 5;
  const x = (i: number) => (i / (points.length - 1)) * 100;
  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  const area = `0,100 ${line} 100,100`;
  const bandTop = y(max), bandBottom = y(min);
  return (
    <svg className="ds-trend" viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height={height} role="img" aria-label="نمودار روند اندازهگیریها">
      <rect className="ds-trend-band" x="0" y={bandTop} width="100" height={Math.max(1, bandBottom - bandTop)} />
      <polyline className="ds-trend-line" points={line} fill="none" vectorEffect="non-scaling-stroke" />
      <polygon className="ds-trend-area" points={area} />
      {points.map((p, i) => (
        <circle key={i} className="ds-trend-dot" cx={x(i)} cy={y(p.value)} r="1.4" vectorEffect="non-scaling-stroke">
          <title>{`${p.label}: ${p.value}`}</title>
        </circle>
      ))}
    </svg>
  );
}

export function DataTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="ds-table-wrap">
      <table className="table ds-table">
        <thead><tr>{headers.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
