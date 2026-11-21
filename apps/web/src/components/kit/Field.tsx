import { useId, type ReactNode } from "react";

export interface FieldControlProps { id: string; "aria-describedby"?: string; "aria-invalid"?: true }

/**
 * برچسب + کنترل + راهنما + خطا با ارتباط ARIA درست (htmlFor / aria-describedby).
 * استفاده: <Field label="عنوان">{(p) => <input className="input" {...p} />}</Field>
 */
export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: (p: FieldControlProps) => ReactNode }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      {children({ id, "aria-describedby": describedBy, ...(error ? { "aria-invalid": true as const } : {}) })}
      {hint && <span id={hintId} className="help">{hint}</span>}
      {error && <span id={errId} className="field-error" role="alert">{error}</span>}
    </div>
  );
}
