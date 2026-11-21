"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Alert, Badge } from "@/components/design";
import { PROPOSALS, type ProposalCategory } from "@/lib/proposals";

const KEY = "nvy-proposals-selected";
const CATS: ProposalCategory[] = [
  "فرانت و طراحی", "تجربه کاربر", "بکاند و دیتابیس", "امنیت",
  "DevOps و CI/CD", "مانیتورینگ", "تست و کیفیت", "مستندات",
];

/** تختهٔ پیشنهادهای بصری — هر ایده قابلانتخاب است و انتخابها ذخیره میشوند. */
export default function ProposalsPage() {
  const [selected, setSelected] = useState<string[]>([]);
  const [cat, setCat] = useState<ProposalCategory | "همه">("همه");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setSelected(JSON.parse(raw) as string[]);
    } catch { /* ignore */ }
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const visible = useMemo(() => (cat === "همه" ? PROPOSALS : PROPOSALS.filter((p) => p.cat === cat)), [cat]);
  const chosen = PROPOSALS.filter((p) => selected.includes(p.id));

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>نقشهٔ پیشنهادها و توسعه</h1>
          <p className="muted">ایدههای خلاقانه و هوشمندانه برای تمام لایههای پروژه — ببینید، مقایسه کنید و انتخاب کنید.</p>
        </div>
        <Link href="/design" className="btn ghost">نمایشگاه تمها</Link>
      </header>

      <Alert tone="info" title="چگونه کار میکند">
        هر کارت را انتخاب کنید؛ لیست «برنامهٔ من» در انتها ساخته میشود و در مرورگر ذخیره میشود. سپس میگویید کدام گروهها را پیادهسازی کنم.
      </Alert>

      <section className="card stack">
        <h2 className="fs-lg m-0">دستهبندیها</h2>
        <div className="row gap-2 wrap">
          {(["همه", ...CATS] as const).map((c) => (
            <button key={c} type="button" className={`chip ${cat === c ? "active" : ""}`} aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
        <p className="muted small">{visible.length} ایده در «{cat}» — {chosen.length} ایده انتخابشده</p>
      </section>

      <section className="prop-grid">
        {visible.map((p) => (
          <article key={p.id} className={`prop-card ${selected.includes(p.id) ? "prop-selected" : ""}`}>
            <div className="row between">
              <span className="prop-icon" aria-hidden="true">{p.icon}</span>
              <Badge tone={selected.includes(p.id) ? "ok" : "info"}>{p.cat}</Badge>
            </div>
            <h3 className="fs-md m-0">{p.title}</h3>
            <p className="muted small prop-desc">{p.desc}</p>
            <div className="row gap-2 wrap prop-meta">
              <span className="muted small">ارزش: {"⭐".repeat(p.impact)}</span>
              <span className="muted small">تلاش: {p.effort}</span>
            </div>
            <button className={`btn btn-sm ${selected.includes(p.id) ? "btn-primary" : ""}`} type="button" onClick={() => toggle(p.id)} aria-pressed={selected.includes(p.id)}>
              {selected.includes(p.id) ? "✓ انتخاب شد" : "+ افزودن به برنامه"}
            </button>
          </article>
        ))}
      </section>

      <section className="card stack prop-summary">
        <h2 className="fs-lg m-0">برنامهٔ من ({chosen.length})</h2>
        {chosen.length === 0 ? <p className="muted">هنوز ایدهای انتخاب نکردهاید.</p> : (
          <ul className="prop-chosen">
            {chosen.map((p) => <li key={p.id}><strong>{p.title}</strong><span className="muted small">— {p.cat}</span></li>)}
          </ul>
        )}
        <div className="row gap-2 wrap">
          <button className="btn" type="button" onClick={async () => {
            const text = chosen.map((p) => `- ${p.title} (${p.cat})`).join("\n");
            try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
          }}>کپی لیست انتخابها</button>
          <button className="btn ghost" type="button" onClick={() => { setSelected([]); try { localStorage.removeItem(KEY); } catch { /* ignore */ } }}>پاک کردن انتخابها</button>
        </div>
      </section>
    </div>
  );
}
