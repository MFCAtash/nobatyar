import Link from "next/link";
import type { ReactNode } from "react";

export interface EmptyAction { label: string; href?: string; onClick?: () => void }

/** حالت خالی دوستانه: توضیح می‌دهد چه شده و قدم بعدی چیست. */
export function EmptyState({ icon, title, description, action }: { icon?: string; title: string; description?: ReactNode; action?: EmptyAction }) {
  return (
    <div className="empty-state" role="status">
      {icon && <div className="empty-state-icon" aria-hidden="true">{icon}</div>}
      <p className="empty-state-title">{title}</p>
      {description && <p className="muted small">{description}</p>}
      {action && (action.href
        ? <Link href={action.href} className="btn btn-primary mt-2">{action.label}</Link>
        : <button type="button" className="btn btn-primary mt-2" onClick={action.onClick}>{action.label}</button>)}
    </div>
  );
}
