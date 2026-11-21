import type { ReactNode } from "react";

const BUSY = { role: "status", "aria-busy": true, "aria-label": "در حال بارگذاری" } as const;

export function Skeleton({ shape = "line", className = "" }: { shape?: "line" | "title" | "block" | "avatar" | "chip"; className?: string }) {
  return <div className={`skeleton sk-${shape} ${className}`.trim()} aria-hidden="true" />;
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="stack gap-2" {...BUSY}>
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} className={i === lines - 1 ? "sk-short" : ""} />)}
    </div>
  );
}

/** ردیف کارت با آواتار (فهرست نوبت، پیام، پرونده) */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="stack" {...BUSY}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card row sk-card" aria-hidden="true">
          <Skeleton shape="avatar" />
          <div className="flex-1 stack gap-2"><Skeleton shape="title" /><Skeleton className="sk-short" /></div>
        </div>
      ))}
    </div>
  );
}

/** شبکه‌ی کارت پزشک */
export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-3" {...BUSY}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card stack gap-3" aria-hidden="true">
          <div className="row"><Skeleton shape="avatar" /><div className="flex-1 stack gap-2"><Skeleton shape="title" /><Skeleton className="sk-short" /></div></div>
          <div className="row gap-2"><Skeleton shape="chip" /><Skeleton shape="chip" /></div>
          <Skeleton /><Skeleton className="sk-short" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonBox({ children }: { children?: ReactNode }) {
  return <div {...BUSY}>{children ?? <Skeleton shape="block" />}</div>;
}
