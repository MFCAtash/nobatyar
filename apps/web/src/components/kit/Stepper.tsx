import { formatDigits } from "@/lib/format";

export interface Step { id: string; label: string }

/** نوار مراحل: ordered list با aria-current="step" (قابل‌خواندن برای صفحه‌خوان). */
export function Stepper({ steps, current, label = "مراحل" }: { steps: Step[]; current: number; label?: string }) {
  return (
    <ol className="stepper" aria-label={label}>
      {steps.map((s, i) => {
        const state = i < current ? "done" : i === current ? "current" : "todo";
        return (
          <li key={s.id} className="step" data-state={state} aria-current={state === "current" ? "step" : undefined}>
            <span className="step-dot" aria-hidden="true">{state === "done" ? "✓" : formatDigits(i + 1)}</span>
            <span className="step-label">{s.label}</span>
            {state === "done" && <span className="sr-only">(انجام شد)</span>}
          </li>
        );
      })}
    </ol>
  );
}
