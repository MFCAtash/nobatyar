import { DateText } from "@/components/kit";
import { ErrorBox } from "@/components/ui";
import { formatBytes } from "@/lib/files";
import type { RecordDetail } from "./types";

export interface RecordDetailViewProps {
  rec: RecordDetail;
  isOwner: boolean;
  uploading: boolean;
  uploadError: string | null;
  onBack: () => void;
  onPickFile: (f: File) => void;
  onDownload: (attachmentId: string) => void;
  onShare: () => void;
  onRevoke: (shareId: string) => void;
}

export function RecordDetailView(p: RecordDetailViewProps) {
  const { rec } = p;
  return (
    <div className="container mw-xl">
      <div className="row between mb-5">
        <h1 className="page-title">{rec.title}</h1>
        <button type="button" className="btn btn-ghost btn-sm" onClick={p.onBack}>← بازگشت</button>
      </div>

      {rec.content && (
        <div className="card mb-4">
          <div className="muted small fw-medium mb-2">محتوا</div>
          <p className="rec-content">{rec.content}</p>
        </div>
      )}
      {rec.tags.length > 0 && <div className="flex flex-wrap gap-2 mb-4">{rec.tags.map((t) => <span key={t} className="chip chip-xs">{t}</span>)}</div>}

      <div className="rec-grid">
        <section className="card" aria-labelledby="att-h">
          <div className="row between mb-3">
            <h2 id="att-h" className="fs-base fw-bold m-0">📎 پیوست‌ها</h2>
            {p.isOwner && (
              <label className="btn btn-ghost btn-sm" aria-disabled={p.uploading}>
                {p.uploading ? "در حال آپلود…" : "+ آپلود"}
                <input type="file" className="sr-only" disabled={p.uploading} accept="image/*,.pdf,.doc,.docx,.txt,.xlsx"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) p.onPickFile(f); e.target.value = ""; }} />
              </label>
            )}
          </div>
          <ErrorBox message={p.uploadError} />
          {rec.attachments.length === 0 ? <p className="muted small">پیوستی ندارد</p> : (
            <div className="stack gap-2">
              {rec.attachments.map((a) => (
                <button key={a.id} type="button" className="attach" onClick={() => p.onDownload(a.id)}>
                  <span aria-hidden="true">{a.mimeType.startsWith("image/") ? "🖼️" : "📄"}</span>
                  <span className="flex-1 min-w-0">
                    <span className="attach-name block">{a.fileName}</span>
                    <span className="muted fs-2xs">{formatBytes(a.sizeBytes)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {p.isOwner && (
          <section className="card" aria-labelledby="share-h">
            <div className="row between mb-3">
              <h2 id="share-h" className="fs-base fw-bold m-0">👨‍⚕️ اشتراک با پزشک</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={p.onShare}>+ اشتراک</button>
            </div>
            {rec.shares.length === 0 ? <p className="muted small">با هیچ پزشکی به اشتراک گذاشته نشده</p> : (
              <div className="stack gap-2">
                {rec.shares.map((s) => (
                  <div key={s.id} className="row between share-row">
                    <div>
                      <div className="fw-medium fs-sm">{s.doctor.fullName}</div>
                      {s.expiresAt && <div className="muted fs-2xs">انقضا: <DateText value={s.expiresAt} variant="medium" /></div>}
                    </div>
                    <button type="button" className="btn btn-danger btn-xs" onClick={() => p.onRevoke(s.id)}>لغو</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
