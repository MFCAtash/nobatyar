"use client";

import { useState } from "react";
import { Alert, Stepper } from "@/components/design";
import { ModuleGate } from "@/components/system/ModuleGate";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/messages";
import { uploadSteps, validateUploadInput } from "@/lib/upload-flow";

type Bucket = "chat" | "records";

const STEP_LABEL: Record<string, string> = {
  token: "دریافت توکن",
  put: "ارسال فایل",
  finalize: "نهایی کردن",
};

const ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "image/tiff",
  "application/dicom",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

function UploadContent() {
  const { api } = useAuth();
  const [bucket, setBucket] = useState<Bucket>("chat");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [objectKey, setObjectKey] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  const steps = uploadSteps().map((s) => STEP_LABEL[s] ?? s);

  const submit = async () => {
    if (!file) return;
    setErr(null);
    setObjectKey(null);
    setStep(0);

    const checked = validateUploadInput({ name: file.name, type: file.type, size: file.size });
    if (!checked.ok) {
      setErr(checked.error);
      return;
    }

    setBusy(true);
    try {
      const token = await api.post<{ objectKey: string; presignedPut: string }>("/storage/upload-token", {
        bucket,
        mime: checked.mime,
        bytes: file.size,
      });
      setStep(1);

      const put = await fetch(token.presignedPut, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!put.ok) {
        setErr("آپلود فایل به مقصد ناموفق بود.");
        return;
      }
      setStep(2);

      await api.post("/storage/finalize", {
        bucket,
        objectKey: token.objectKey,
        mime: checked.mime,
        bytes: file.size,
      });
      setObjectKey(token.objectKey);
      setStep(3);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      {err && <Alert tone="bad" title="خطا">{err}</Alert>}
      {objectKey && (
        <Alert tone="ok" title="آپلود با موفقیت انجام شد">
          <p className="m-0">کلید شیء: <code>{objectKey}</code></p>
          <p className="muted small m-0">فقط فایلهای تأییدشده و اسکنشده قابل دانلود هستند.</p>
        </Alert>
      )}

      <section className="card stack">
        <h2 className="fs-lg m-0">انتخاب فایل</h2>
        <div className="row gap-2 wrap">
          <select className="input" value={bucket} onChange={(e) => setBucket(e.target.value as Bucket)} aria-label="مقصد آپلود">
            <option value="chat">گفتگو</option>
            <option value="records">پرونده</option>
          </select>
          <input
            className="input"
            type="file"
            accept={ACCEPT}
            aria-label="انتخاب فایل"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setErr(null);
              setObjectKey(null);
              setStep(0);
            }}
          />
          <button className="btn btn-primary" type="button" disabled={busy || !file} onClick={() => void submit()}>
            {busy ? "در حال آپلود…" : "آپلود"}
          </button>
        </div>
        <p className="muted small m-0">حداکثر حجم ۲۰ مگابایت. انواع مجاز: تصویر، PDF، DICOM، Word و اکسل.</p>
      </section>

      <section className="card stack">
        <h2 className="fs-lg m-0">مراحل آپلود</h2>
        <Stepper steps={steps} current={step} />
      </section>
    </div>
  );
}

export default function FileUploadPage() {
  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>آپلود فایل</h1>
          <p className="muted">ارسال ایمن فایل به فضای ذخیرهسازی</p>
        </div>
      </header>
      <ModuleGate flag="FF_M6_SMART_FILES">
        <UploadContent />
      </ModuleGate>
    </div>
  );
}
