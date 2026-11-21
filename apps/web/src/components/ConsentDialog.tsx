"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/messages";
import { ErrorBox, Modal } from "./ui";

export const CONSENT_VERSION = "1.0";

/** درخواست رضایت پردازش اطلاعات سلامت (لازم برای رزرو). */
export function ConsentDialog({ onGranted, onClose }: { onGranted: () => void; onClose: () => void }) {
  const { api } = useAuth();
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      await api.post("/me/consents", { type: "HEALTH_DATA_PROCESSING", version: CONSENT_VERSION });
      onGranted();
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <Modal title="رضایت پردازش اطلاعات سلامت" onClose={onClose}>
      <p className="muted small">برای رزرو نوبت، اطلاعاتی که ثبت می‌کنید (مثل دلیل مراجعه) به‌صورت رمزنگاری‌شده نگهداری و فقط با پزشک همان نوبت به‌اشتراک گذاشته می‌شود. هر زمان می‌توانید رضایت را پس بگیرید.</p>
      <label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> شرایط پردازش اطلاعات سلامت را می‌پذیرم.</label>
      <div className="stack mt-4">
        <ErrorBox message={err} />
        <div className="row">
          <button className="btn btn-primary" disabled={!agree || busy} onClick={() => void submit()}>پذیرفتن و ادامه</button>
          <button className="btn btn-ghost" onClick={onClose}>انصراف</button>
        </div>
      </div>
    </Modal>
  );
}
