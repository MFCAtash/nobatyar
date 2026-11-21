import { DateText, EmptyState, Num, SkeletonList } from "@/components/kit";
import type { Notification } from "@/lib/notifications-state";

export const KIND_ICON: Record<string, string> = {
  APPOINTMENT_REMINDER: "🗓️", APPOINTMENT_CONFIRMED: "✅", APPOINTMENT_CANCELLED: "❌", PAYMENT_SUCCESS: "💳",
  PAYMENT_FAILED: "⚠️", SECOND_OPINION_READY: "🔬", VIDEO_ROOM_READY: "🎥", SYSTEM: "🔔",
};

export interface NotificationsViewProps {
  items: Notification[];
  unread: number;
  loading: boolean;
  hasMore: boolean;
  onRead: (id: string) => void;
  onReadAll: () => void;
  onMore: () => void;
}

export function NotificationsView(p: NotificationsViewProps) {
  return (
    <>
      <div className="row between mb-4">
        <h1 className="page-title">
          اعلان‌ها
          {p.unread > 0 && <span className="badge badge-warn fs-xs ms-2"><Num value={p.unread} /></span>}
        </h1>
        {p.unread > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={p.onReadAll}>همه را خوانده کن</button>}
      </div>

      {p.loading && p.items.length === 0 && <SkeletonList rows={4} />}
      {!p.loading && p.items.length === 0 && <EmptyState icon="🔔" title="هیچ اعلانی ندارید" description="یادآوری نوبت و وضعیت پرداخت اینجا نمایش داده می‌شود." />}

      <div className="stack gap-2">
        {p.items.map((n) => {
          const unread = !n.readAt;
          return (
            <div
              key={n.id} className="card row notice" data-unread={unread}
              role={unread ? "button" : undefined} tabIndex={unread ? 0 : undefined}
              onClick={() => { if (unread) p.onRead(n.id); }}
              onKeyDown={(e) => { if (unread && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); p.onRead(n.id); } }}
            >
              <span className="notice-icon" aria-hidden="true">{KIND_ICON[n.kind] ?? "🔔"}</span>
              <div className="flex-1 min-w-0">
                <div className="fw-bold mb-1">{n.titleFa}</div>
                <div className="muted small lh-tight">{n.bodyFa}</div>
                <DateText value={n.createdAt} variant="datetime" className="muted fs-2xs block mt-1" />
              </div>
              {unread && <span className="notice-dot" role="img" aria-label="خوانده‌نشده" />}
            </div>
          );
        })}
      </div>

      {p.hasMore && (
        <div className="text-center mt-5">
          <button type="button" className="btn" disabled={p.loading} onClick={p.onMore}>{p.loading ? "در حال بارگذاری…" : "نمایش بیشتر"}</button>
        </div>
      )}
    </>
  );
}
