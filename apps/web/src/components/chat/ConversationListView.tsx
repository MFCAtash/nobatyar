import Link from "next/link";
import { Avatar, DateText, EmptyState, Num, SkeletonList } from "@/components/kit";
import { ErrorBox } from "@/components/ui";

export interface ConvSummary {
  id: string;
  appointmentId: string;
  peer: { userId: string; fullName: string };
  lastMessage: { id: string; kind: string; senderId: string; bodyPreview: string; readAt: string | null; createdAt: string } | null;
  unread: number;
  createdAt: string;
}

export function ConversationListView({ items, loading, error }: { items: ConvSummary[] | undefined; loading: boolean; error: string | null }) {
  return (
    <div className="container mw-lg">
      <h1 className="page-title mb-5">پیام‌رسانی</h1>
      <ErrorBox message={error} />
      {loading && <SkeletonList rows={4} />}
      {!loading && !error && items?.length === 0 && (
        <EmptyState icon="💬" title="هنوز مکالمه‌ای ندارید" description="پس از رزرو نوبت می‌توانید با پزشک پیام تبادل کنید." action={{ label: "جستجوی پزشک", href: "/" }} />
      )}
      <div className="stack gap-2">
        {items?.map((c) => (
          <Link key={c.id} href={`/chat/${c.id}`} className="card row conv" data-unread={c.unread > 0}>
            <Avatar name={c.peer.fullName} size="md" />
            <div className="conv-body">
              <div className="row between">
                <span className="conv-name">{c.peer.fullName}</span>
                {c.lastMessage && <DateText value={c.lastMessage.createdAt} variant="time" className="muted fs-xs" />}
              </div>
              <div className="row between mt-1">
                <span className="conv-preview">{c.lastMessage?.bodyPreview ?? "مکالمه جدید"}</span>
                {c.unread > 0 && <span className="unread-pill"><Num value={c.unread} /><span className="sr-only"> پیام خوانده‌نشده</span></span>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
