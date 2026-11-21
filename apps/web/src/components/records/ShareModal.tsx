"use client";
import { useState } from "react";
import { Field, JalaliPreview } from "@/components/kit";
import { ErrorBox, Modal } from "@/components/ui";
import { useApiMutation } from "@/lib/query/hooks";
import { qk } from "@/lib/query/keys";
import { errorMessage } from "@/lib/messages";

export function ShareModal({ recordId, onClose }: { recordId: string; onClose: () => void }) {
  const [doctorId, setDoctorId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [localErr, setLocalErr] = useState<string | null>(null);
  const share = useApiMutation<{ doctorId: string; expiresAt: string }>({
    run: (v, api) => api.post(`/records/${recordId}/shares`, { doctorId: v.doctorId, ...(v.expiresAt ? { expiresAt: new Date(v.expiresAt).toISOString() } : {}) }),
    invalidate: [[...qk.record(recordId)]],
    onSuccess: onClose,
  });
  const submit = () => {
    if (!doctorId.trim()) return setLocalErr("شناسه پزشک الزامی است");
    setLocalErr(null);
    share.mutate({ doctorId: doctorId.trim(), expiresAt });
  };
  return (
    <Modal title="اشتراک‌گذاری با پزشک" onClose={onClose}>
      <div className="stack mt-3">
        <ErrorBox message={localErr ?? (share.isError ? errorMessage(share.error) : null)} />
        <Field label="شناسه UUID پزشک *" hint="از صفحه‌ی پروفایل پزشک کپی کنید">
          {(f) => <input className="input ltr" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" {...f} value={doctorId} onChange={(e) => setDoctorId(e.target.value)} />}
        </Field>
        <Field label="تاریخ انقضا (اختیاری)" hint={<JalaliPreview value={expiresAt} />}>
          {(f) => <input className="input ltr" type="date" {...f} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />}
        </Field>
        <div className="row">
          <button type="button" className="btn btn-primary flex-1" disabled={share.isPending} onClick={submit}>{share.isPending ? "در حال ذخیره…" : "اشتراک‌گذاری"}</button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>انصراف</button>
        </div>
      </div>
    </Modal>
  );
}
