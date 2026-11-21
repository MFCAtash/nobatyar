"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, Badge, FormField } from "@/components/design";
import { RequireAuth } from "@/components/RequireAuth";
import { useToast } from "@/components/Toast";

const ITEMS = [
  { id: "id", label: "مدرک هویتی", desc: "کارت ملی یا شناسنامه" },
  { id: "insurance", label: "بیمه (در صورت وجود)", desc: "عکس پوشش بیمه" },
  { id: "meds", label: "لیست داروها", desc: "نام و دوز داروهای مصرفی" },
  { id: "records", label: "مدارک آزمایشگاهی", desc: "نتایج اخیر آزمایشها" },
];

/** Pre-check: تکمیل چکلیست قبل از ویزیت — ذخیره محلی و قابلارزیابی توسط پزشک. */
function Precheck() {
  const toast = useToast();
  const [done, setDone] = useState<string[]>([]);
  const [note, setNote] = useState("");
  useEffect(() => {
    try {
      const raw = localStorage.getItem("nvy-precheck");
      if (raw) { const d = JSON.parse(raw) as { done: string[]; note: string }; setDone(d.done); setNote(d.note); }
    } catch { /* ignore */ }
  }, []);
  const save = (d: string[], n: string) => {
    setDone(d); setNote(n);
    try { localStorage.setItem("nvy-precheck", JSON.stringify({ done: d, note: n })); } catch { /* ignore */ }
  };
  return (
    <div className="stack">
      <header className="page-head"><div><h1>آمادگی پیش از ویزیت</h1><p className="muted">مدارک و اطلاعات خود را قبل از رزرو تکمیل کنید.</p></div><Link href="/" className="btn ghost">بازگشت</Link></header>
      <Alert tone="warn" title="توصیه">تکمیل این چکلیست زمان ویزیت را کاهش میدهد؛ اطلاعات فقط روی دستگاه شما ذخیره میشود.</Alert>
      <section className="card stack">
        {ITEMS.map((it) => (
          <label key={it.id} className="check">
            <input type="checkbox" checked={done.includes(it.id)} onChange={(e) => save(e.target.checked ? [...done, it.id] : done.filter((x) => x !== it.id), note)} />
            <span><strong>{it.label}</strong><span className="muted small"> — {it.desc}</span></span>
          </label>
        ))}
        <FormField label="توضیحات تکمیلی (اختیاری)"><textarea className="textarea" value={note} onChange={(e) => save(done, e.target.value)} placeholder="مثلاً داروی جدیدی که اخیراً شروع کردهاید" /></FormField>
        <div className="row gap-2 wrap">
          <Badge tone={done.length === ITEMS.length ? "ok" : "info"}>{done.length} از {ITEMS.length} تکمیل شد</Badge>
          <button className="btn btn-primary" type="button" onClick={() => toast("چکلیست ذخیره شد", "ok")}>ذخیره</button>
        </div>
      </section>
    </div>
  );
}

export default function PrecheckPage() {
  return <RequireAuth><Precheck /></RequireAuth>;
}
