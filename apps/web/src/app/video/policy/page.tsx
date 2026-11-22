"use client";

import { useCallback, useState } from "react";
import { Badge } from "@/components/design";
import { ErrorBox, Loading } from "@/components/ui";
import { ModuleGate } from "@/components/system/ModuleGate";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/messages";
import { formatDateTime } from "@/lib/format";

interface Policy {
  waitingRoom: boolean;
  allowScreenShare: boolean;
  captions: boolean;
  recordConsent: boolean;
  retentionHours: number | null;
}
interface PolicyResponse {
  policy: Policy;
  consent: { patient: boolean; doctor: boolean };
  recordingAllowed: boolean;
  retentionDeadline: string | null;
}

export default function VideoPolicyPage() {
  const { api } = useAuth();
  const [id, setId] = useState("");
  const [data, setData] = useState<PolicyResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setBusy(true);
    setErr(null);
    try {
      setData(await api.get<PolicyResponse>(`/appointments/${id}/video/policy`));
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [api, id]);

  const put = async (patch: Partial<Policy>) => {
    if (!data) return;
    setBusy(true);
    setErr(null);
    try {
      await api.put(`/appointments/${id}/video/policy`, patch);
      await load();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const consent = async () => {
    setBusy(true);
    setErr(null);
    setNotice(null);
    try {
      await api.post(`/appointments/${id}/video/recording-consent`, { accept: true });
      setNotice("رضایت شما ثبت شد؛ ضبط فقط با رضایت هر دو طرف آغاز می‌شود.");
      await load();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>سیاست اتاق ویدئو</h1>
          <p className="muted">اتاق انتظار، ضبط با رضایت دوطرفه و مهلت نگهداری</p>
        </div>
      </header>
      <ModuleGate flag="FF_M8_VIDEO_SMART">
        <div className="stack">
          <section className="card stack">
            <div className="row gap-2">
              <input className="input" value={id} onChange={(e) => setId(e.target.value)} placeholder="شناسهٔ نوبت (UUID)" aria-label="شناسهٔ نوبت" />
              <button className="btn btn-primary" type="button" disabled={!id || busy} onClick={() => void load()}>بارگذاری</button>
            </div>
            {err && <ErrorBox message={err} />}
            {notice && <div className="card">{notice}</div>}
          </section>

          {busy && !data ? <Loading /> : data && (
            <section className="card stack">
              <div className="row between">
                <h2 className="fs-lg m-0">تنظیمات</h2>
                <Badge tone={data.recordingAllowed ? "ok" : "warn"}>{data.recordingAllowed ? "ضبط مجاز" : "ضبط غیرمجاز"}</Badge>
              </div>
              <label className="row gap-2">
                <input
                  type="checkbox"
                  checked={data.policy.waitingRoom}
                  onChange={(e) => void put({ waitingRoom: e.target.checked })}
                />
                <span>اتاق انتظار (پیشفرض روشن)</span>
              </label>
              <label className="row gap-2">
                <input
                  type="checkbox"
                  checked={data.policy.captions}
                  onChange={(e) => void put({ captions: e.target.checked })}
                />
                <span>زیرنویس</span>
              </label>
              <label className="row gap-2">
                <input
                  type="checkbox"
                  checked={data.policy.allowScreenShare}
                  onChange={(e) => void put({ allowScreenShare: e.target.checked })}
                />
                <span>اشتراک صفحه (پیشفرض خاموش)</span>
              </label>
              <label className="row gap-2">
                <input
                  type="checkbox"
                  checked={data.policy.recordConsent}
                  onChange={(e) => void put({ recordConsent: e.target.checked })}
                />
                <span>درخواست رضایت ضبط</span>
              </label>
              <p className="muted small m-0">
                رضایت: بیمار {data.consent.patient ? "✓" : "✗"} · پزشک {data.consent.doctor ? "✓" : "✗"}
              </p>
              {data.policy.recordConsent && <button className="btn btn-primary self-start" type="button" disabled={busy} onClick={() => void consent()}>ثبت رضایت من</button>}
              {data.retentionDeadline && <p className="muted small m-0">حذف خودکار تا: {formatDateTime(data.retentionDeadline)}</p>}
            </section>
          )}
        </div>
      </ModuleGate>
    </div>
  );
}
