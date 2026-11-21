import Link from "next/link";
import { DateText, EmptyState, Num, SkeletonList } from "@/components/kit";
import { ErrorBox } from "@/components/ui";
import { CATEGORY_ICON, CATEGORY_LABEL, type RecordSummary } from "@/lib/record-categories";

export interface RecordsListViewProps {
  records: RecordSummary[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  category: string;
  hasMore: boolean;
  onCategory: (c: string) => void;
  onMore: () => void;
  onAdd: () => void;
}

export function RecordsListView(p: RecordsListViewProps) {
  return (
    <div className="container mw-xl">
      <div className="row between mb-4">
        <h1 className="page-title">پرونده سلامت</h1>
        <button type="button" className="btn btn-primary btn-sm" onClick={p.onAdd}>+ پرونده جدید</button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="فیلتر دسته‌بندی">
        {["", ...Object.keys(CATEGORY_LABEL)].map((cat) => (
          <button key={cat} type="button" aria-pressed={p.category === cat} className={`btn btn-sm ${p.category === cat ? "btn-primary" : "btn-ghost"}`} onClick={() => p.onCategory(cat)}>
            {cat ? `${CATEGORY_ICON[cat]} ${CATEGORY_LABEL[cat]}` : "همه"}
          </button>
        ))}
      </div>

      <ErrorBox message={p.error} />
      {p.loading && <SkeletonList rows={4} />}
      {!p.loading && !p.error && p.records.length === 0 && (
        <EmptyState icon="📋" title="هیچ پرونده‌ای ثبت نشده" description="نتیجه‌ی آزمایش، نسخه و یادداشت‌های پزشکی را یک‌جا نگه دارید." action={{ label: "اولین پرونده را ایجاد کنید", onClick: p.onAdd }} />
      )}

      <div className="stack gap-2">
        {p.records.map((r) => (
          <Link key={r.id} href={`/records/${r.id}`} className="card row rec-item">
            <span className="rec-icon" aria-hidden="true">{CATEGORY_ICON[r.category] ?? "📄"}</span>
            <div className="flex-1 min-w-0">
              <div className="rec-title">{r.title}</div>
              <div className="row gap-2">
                <span className="badge badge-info fs-2xs">{CATEGORY_LABEL[r.category] ?? r.category}</span>
                {r.visitDate && <DateText value={r.visitDate} variant="medium" className="muted small" />}
                {r.attachmentCount > 0 && <span className="muted small">📎 <Num value={r.attachmentCount} /> پیوست</span>}
              </div>
              {r.tags.length > 0 && <div className="flex flex-wrap gap-1 mt-1">{r.tags.map((t) => <span key={t} className="chip chip-xs">{t}</span>)}</div>}
            </div>
            <DateText value={r.createdAt} variant="medium" className="muted shrink-0 fs-2xs" />
          </Link>
        ))}
      </div>

      {p.hasMore && (
        <div className="text-center mt-4">
          <button type="button" className="btn" disabled={p.loadingMore} onClick={p.onMore}>{p.loadingMore ? "در حال بارگذاری…" : "بیشتر"}</button>
        </div>
      )}
    </div>
  );
}
