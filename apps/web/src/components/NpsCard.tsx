"use client";
import { useEffect, useState } from "react";
import { Badge } from "@/components/design";
import { useToast } from "@/components/Toast";

const key = (id: string) => `nvy-nps-${id}`;

/** نظرسنجی NPS پس از ویزیت — ذخیره محلی، بدون انتقال داده سلامت. */
export function NpsCard({ appointmentId }: { appointmentId: string }) {
  const toast = useToast();
  const [score, setScore] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key(appointmentId));
      if (raw) { const d = JSON.parse(raw) as { score: number; note: string }; setScore(d.score); setNote(d.note); setSaved(true); }
    } catch { /* ignore */ }
  }, [appointmentId]);

  const save = () => {
    if (score === null) return;
    try { localStorage.setItem(key(appointmentId), JSON.stringify({ score, note })); } catch { /* ignore */ }
    setSaved(true);
    toast("از بازخورد شما متشکریم", "ok");
  };

  return (
    <section className="card stack">
      <div className="row between"><h2 className="fs-lg m-0">تجربهٔ ویزیت چگونه بود؟</h2>{saved && <Badge tone="ok">ثبت شد</Badge>}</div>
      <div className="row gap-2 wrap">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <button key={n} type="button" className={`btn btn-sm ${score === n ? "btn-primary" : ""}`} onClick={() => setScore(n)} aria-pressed={score === n}>{n}</button>
        ))}
      </div>
      <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="چه چیزی میتوانست بهتر باشد؟ (اختیاری)" />
      <button className="btn self-start" type="button" disabled={score === null || saved} onClick={save}>ثبت بازخورد</button>
    </section>
  );
}
