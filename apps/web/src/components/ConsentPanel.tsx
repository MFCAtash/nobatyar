"use client";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { ErrorBox } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/messages";
import type { Consent } from "@/lib/types";

/** رضایت صریح و جداگانه برای دستیار بالینی Ambient — پیششرط شروع ضبط ویزیت (پزشک + بیمار). */
export function ConsentPanel() {
  const { api } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Consent[]>([]);
  const [version, setVersion] = useState("2026-01");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api.get<Consent[]>("/me/consents")); }
    catch (e) { setErr(errorMessage(e)); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  const act = async (path: string, body?: unknown) => {
    setBusy(true); setErr(null);
    try {
      await api.post(path, body);
      toast("رضایت بهروز شد", "ok");
      await load();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const active = items.filter((c) => c.type === "AMBIENT_SCRIBE" && !c.revokedAt);
  return (
    <section className="card stack" aria-label="رضایت دستیار بالینی">
      <div>
        <h2 className="fs-lg m-0">رضایت ضبط ویزیت (AI Scribe)</h2>
        <p className="muted small">
          بدون رضایت صریح و فعال «شما و طرف مقابل»، دستیار بالینی قابل استفاده نیست.
          رضایت هر لحظه قابل ابطال است و اثر آن بلافاصله اعمال میشود.
        </p>
      </div>
      <ErrorBox message={err} />
      <p className="muted">وضعیت فعلی: {active.length > 0 ? `فعال (نسخه ${active[0]!.version} از ${formatDateTime(active[0]!.grantedAt)})` : "غیرفعال"}</p>
      <div className="row gap-2 wrap">
        <label>نسخه رضایت
          <input value={version} maxLength={32} onChange={(e) => setVersion(e.target.value)} />
        </label>
        <button className="btn btn-primary" disabled={busy || !version.trim()} type="button" onClick={() => void act("/me/consents", { type: "AMBIENT_SCRIBE", version })}>
          ثبت رضایت صریح
        </button>
        {active.length > 0 && (
          <button className="btn ghost" disabled={busy} type="button" onClick={() => void act("/me/consents/AMBIENT_SCRIBE/revoke")}>
            ابطال رضایت
          </button>
        )}
      </div>
    </section>
  );
}
