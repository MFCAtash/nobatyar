"use client";
import { ReactNode, useEffect, useId, useRef } from "react";
import { Skeleton } from "@/components/kit/Skeleton";
import { KIND_LABEL, STATUS_LABEL } from "@/lib/messages";

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? { text: status, tone: "muted" as const };
  return <span className={`badge badge-${s.tone}`}>{s.text}</span>;
}

export const kindLabel = (k: string) => KIND_LABEL[k] ?? k;

export function ErrorBox({ message }: { message: string | null }) {
  return message ? <div className="error-box" role="alert">{message}</div> : null;
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="stack" aria-busy="true" aria-label="در حال بارگذاری">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} shape="block" />)}
    </div>
  );
}

/** پنجره‌ی مودال ساده با Esc و فوکوس اولیه */
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose; // onClose معمولاً تابع inline است؛ effect نباید با هر رندر دوباره اجرا شود (فوکوس می‌پرید)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button, input, textarea, select")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return closeRef.current();
      if (e.key !== "Tab" || !ref.current) return;
      // تله‌ی فوکوس: Tab/Shift+Tab داخل پنجره می‌ماند
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]"));
      if (items.length === 0) return;
      const first = items[0], last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !ref.current.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !ref.current.contains(active))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus(); };
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <h3 id={titleId}>{title}</h3>
        {children}
      </div>
    </div>
  );
}
