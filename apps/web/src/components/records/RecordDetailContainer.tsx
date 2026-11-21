"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SkeletonList } from "@/components/kit";
import { useToast } from "@/components/Toast";
import { ErrorBox } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { MAX_UPLOAD_MB } from "@/lib/files";
import { formatNumber } from "@/lib/format";
import { errorMessage } from "@/lib/messages";
import { useApiMutation, useApiQuery } from "@/lib/query/hooks";
import { qk } from "@/lib/query/keys";
import { RecordDetailView } from "./RecordDetailView";
import { ShareModal } from "./ShareModal";
import type { RecordDetail } from "./types";

export function RecordDetailContainer({ id }: { id: string }) {
  const { api, me } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [sharing, setSharing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const q = useApiQuery<RecordDetail>(qk.record(id), `/records/${id}`);
  const refetch = [[...qk.record(id)]];

  const upload = useApiMutation<File>({
    run: async (file, a) => {
      const { objectKey, presignedPut } = await a.post<{ objectKey: string; presignedPut: string }>("/storage/upload-token", { bucket: "records", mime: file.type, bytes: file.size });
      const put = await fetch(presignedPut, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!put.ok) throw new Error("upload_failed");
      return a.post(`/records/${id}/attachments`, { objectKey, fileName: file.name, mimeType: file.type, sizeBytes: file.size });
    },
    invalidate: refetch,
  });
  const revoke = useApiMutation<string>({ run: (shareId, a) => a.delete(`/records/${id}/shares/${shareId}`), invalidate: refetch });

  if (q.isError) return <div className="container mw-xl"><ErrorBox message={errorMessage(q.error)} /></div>;
  if (!q.data) return <div className="container mw-xl"><SkeletonList rows={3} /></div>;
  const rec = q.data;

  const onPickFile = (file: File) => {
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return setUploadError(`حداکثر ${formatNumber(MAX_UPLOAD_MB)} مگابایت`);
    setUploadError(null);
    upload.mutate(file, { onError: (e) => setUploadError(errorMessage(e)) });
  };
  const onDownload = async (attId: string) => {
    try {
      const { url } = await api.get<{ url: string }>(`/records/attachments/${attId}/download`);
      window.open(url, "_blank", "noopener");
    } catch { toast("دریافت لینک ناموفق بود.", "bad"); }
  };
  const onRevoke = (shareId: string) => {
    if (!confirm("دسترسی این پزشک لغو شود؟")) return;
    revoke.mutate(shareId, { onError: (e) => toast(errorMessage(e), "bad") });
  };

  return (
    <>
      <RecordDetailView
        rec={rec} isOwner={me?.role === "PATIENT"} uploading={upload.isPending} uploadError={uploadError}
        onBack={() => router.back()} onPickFile={onPickFile} onDownload={(a) => void onDownload(a)}
        onShare={() => setSharing(true)} onRevoke={onRevoke}
      />
      {sharing && <ShareModal recordId={id} onClose={() => setSharing(false)} />}
    </>
  );
}
