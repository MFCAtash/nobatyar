"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/design";
import { ErrorBox, Loading } from "@/components/ui";
import { ModuleGate } from "@/components/system/ModuleGate";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/messages";

type Channel = "inapp" | "sms" | "push" | "email";
type EventType =
  | "APPOINTMENT_REMINDER"
  | "APPOINTMENT_CONFIRMED"
  | "APPOINTMENT_CANCELLED"
  | "PAYMENT"
  | "CHAT"
  | "SECOND_OPINION"
  | "SECURITY";

interface PrefsResponse {
  matrix: Record<EventType, Record<Channel, boolean>>;
  quietFrom: string | null;
  quietTo: string | null;
}

const EVENTS: EventType[] = [
  "APPOINTMENT_REMINDER",
  "APPOINTMENT_CONFIRMED",
  "APPOINTMENT_CANCELLED",
  "PAYMENT",
  "CHAT",
  "SECOND_OPINION",
  "SECURITY",
];
const CHANNELS: Channel[] = ["inapp", "sms", "push", "email"];
const LABELS: Record<EventType, string> = {
  APPOINTMENT_REMINDER: "یادآوری نوبت",
  APPOINTMENT_CONFIRMED: "تأیید نوبت",
  APPOINTMENT_CANCELLED: "لغو نوبت",
  PAYMENT: "پرداخت",
  CHAT: "پیام",
  SECOND_OPINION: "نظر دوم",
  SECURITY: "امنیتی",
};

interface UiPrefs {
  theme: "system" | "light" | "dark" | "high-contrast";
  fontScale: number;
  contrast: "normal" | "more" | "most";
  reducedMotion: boolean;
  locale: "fa" | "en";
}

function NotificationPreferences() {
  const { api } = useAuth();
  const [prefs, setPrefs] = useState<PrefsResponse | null>(null);
  const [quietFrom, setQuietFrom] = useState("");
  const [quietTo, setQuietTo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get<PrefsResponse>("/me/notification-preferences");
      setPrefs(r);
      setQuietFrom(r.quietFrom ?? "");
      setQuietTo(r.quietTo ?? "");
    } catch (e) {
      setErr(errorMessage(e));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (event: EventType, channel: Channel) => {
    setPrefs((p) => (p ? { ...p, matrix: { ...p.matrix, [event]: { ...p.matrix[event], [channel]: !p.matrix[event][channel] } } } : p));
    setSaved(false);
  };

  const save = async () => {
    if (!prefs) return;
    setBusy(true);
    setErr(null);
    try {
      const items = EVENTS.flatMap((eventType) =>
        CHANNELS.map((channel) => ({ eventType, channel, enabled: prefs.matrix[eventType][channel] })),
      );
      const quiet = quietFrom && quietTo ? { quietFrom, quietTo } : { quietFrom: null, quietTo: null };
      await api.put("/me/notification-preferences", { items, ...quiet });
      setSaved(true);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!prefs) return err ? <ErrorBox message={err} /> : <Loading />;

  return (
    <section className="card stack">
      <div className="row between">
        <h2 className="fs-lg m-0">اعلان‌ها</h2>
        {saved && <Badge tone="ok">ذخیره شد</Badge>}
      </div>
      <p className="muted small m-0">در ساعات سکوت فقط اعلان‌های درون‌برنامه‌ای نمایش داده می‌شوند؛ اعلان‌های امنیتی همیشه ارسال می‌شوند.</p>
      {err && <ErrorBox message={err} />}
      <div className="row gap-2">
        <label className="stack">
          <span className="small muted">از ساعت</span>
          <input className="input" value={quietFrom} onChange={(e) => { setQuietFrom(e.target.value); setSaved(false); }} placeholder="22:00" inputMode="numeric" />
        </label>
        <label className="stack">
          <span className="small muted">تا ساعت</span>
          <input className="input" value={quietTo} onChange={(e) => { setQuietTo(e.target.value); setSaved(false); }} placeholder="07:00" inputMode="numeric" />
        </label>
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>رویداد</th>
              {CHANNELS.map((c) => <th key={c}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {EVENTS.map((ev) => (
              <tr key={ev}>
                <td>{LABELS[ev]}</td>
                {CHANNELS.map((ch) => (
                  <td key={ch}>
                    <input
                      type="checkbox"
                      checked={prefs.matrix[ev][ch]}
                      onChange={() => toggle(ev, ch)}
                      aria-label={`${LABELS[ev]} — ${ch}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn btn-primary self-start" type="button" disabled={busy} onClick={() => void save()}>
        {busy ? "در حال ذخیره…" : "ذخیرهٔ ترجیحات"}
      </button>
    </section>
  );
}

function AccessibilityPreferences() {
  const { api } = useAuth();
  const [prefs, setPrefs] = useState<UiPrefs | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setPrefs(await api.get<UiPrefs>("/me/ui-preferences"));
      } catch (e) {
        setErr(errorMessage(e));
      }
    })();
  }, [api]);

  const save = async () => {
    if (!prefs) return;
    setBusy(true);
    setErr(null);
    try {
      setPrefs(await api.put<UiPrefs>("/me/ui-preferences", prefs));
      setSaved(true);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!prefs) return err ? <ErrorBox message={err} /> : <Loading />;

  return (
    <section className="card stack">
      <div className="row between">
        <h2 className="fs-lg m-0">ظاهر و دسترس‌پذیری</h2>
        {saved && <Badge tone="ok">ذخیره شد</Badge>}
      </div>
      {err && <ErrorBox message={err} />}
      <label className="stack">
        <span className="small muted">تم</span>
        <select className="input" value={prefs.theme} onChange={(e) => { setPrefs({ ...prefs, theme: e.target.value as UiPrefs["theme"] }); setSaved(false); }}>
          <option value="system">هماهنگ با سیستم</option>
          <option value="light">روشن</option>
          <option value="dark">تیره</option>
          <option value="high-contrast">کنتراست بالا</option>
        </select>
      </label>
      <label className="stack">
        <span className="small muted">اندازهٔ متن ({Math.round(prefs.fontScale * 100)}٪)</span>
        <input
          type="range"
          min={0.85}
          max={1.5}
          step={0.05}
          value={prefs.fontScale}
          onChange={(e) => { setPrefs({ ...prefs, fontScale: Number(e.target.value) }); setSaved(false); }}
        />
      </label>
      <label className="stack">
        <span className="small muted">سطح کنتراست</span>
        <select className="input" value={prefs.contrast} onChange={(e) => { setPrefs({ ...prefs, contrast: e.target.value as UiPrefs["contrast"] }); setSaved(false); }}>
          <option value="normal">معمولی</option>
          <option value="more">بیشتر</option>
          <option value="most">حداکثر</option>
        </select>
      </label>
      <label className="row gap-2">
        <input type="checkbox" checked={prefs.reducedMotion} onChange={(e) => { setPrefs({ ...prefs, reducedMotion: e.target.checked }); setSaved(false); }} />
        <span>کاهش انیمیشن‌ها</span>
      </label>
      <button className="btn btn-primary self-start" type="button" disabled={busy} onClick={() => void save()}>
        {busy ? "در حال ذخیره…" : "ذخیرهٔ تنظیمات"}
      </button>
    </section>
  );
}

export default function PreferencesPage() {
  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>تنظیمات من</h1>
          <p className="muted">اعلان‌ها، ظاهر و دسترس‌پذیری</p>
        </div>
      </header>
      <ModuleGate flag="FF_M5_NOTIF_ORCHESTRATOR">
        <NotificationPreferences />
      </ModuleGate>
      <ModuleGate flag="FF_M15_WCAG">
        <AccessibilityPreferences />
      </ModuleGate>
    </div>
  );
}
