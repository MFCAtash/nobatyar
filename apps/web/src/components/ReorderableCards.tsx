"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

const CARDS = [
  { id: "today", title: "نوبتهای امروز", desc: "لیست ویزیتها و اقدامات سریع", href: "/doctor" },
  { id: "messages", title: "پیامها", desc: "مکالمات بیماران", href: "/chat" },
  { id: "rx", title: "نسخهها", desc: "صدور و بازبینی نسخه", href: "/prescriptions" },
  { id: "vitals", title: "پایش از راه دور", desc: "اندازهگیریهای اخیر بیماران", href: "/vitals" },
];
const KEY = "nvy-doctor-cards-order";

/** داشبورد قابلچینش پزشک — ترتیب کارتهای سریع با Drag & Drop ذخیره میشود. */
export function ReorderableCards() {
  const [order, setOrder] = useState<string[]>(CARDS.map((c) => c.id));
  const [drag, setDrag] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const o = JSON.parse(raw) as string[]; setOrder(o.filter((id) => CARDS.some((c) => c.id === id))); }
    } catch { /* ignore */ }
  }, []);
  const persist = (o: string[]) => {
    setOrder(o);
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* ignore */ }
  };
  const drop = (target: string) => {
    if (!drag || drag === target) return;
    const next = order.filter((x) => x !== drag);
    next.splice(next.indexOf(target), 0, drag);
    persist(next); setDrag(null);
  };

  return (
    <section className="card stack">
      <h2 className="fs-md m-0">دسترسی سریع <span className="muted small">(کشیدن برای تغییر ترتیب)</span></h2>
      <div className="grid grid-2">
        {order.map((id) => {
          const c = CARDS.find((x) => x.id === id)!;
          return (
            <article key={id} className="card glow-card" draggable onDragStart={() => setDrag(id)} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(id)}>
              <strong>{c.title}</strong>
              <p className="muted small">{c.desc}</p>
              <Link className="btn btn-sm" href={c.href}>بازکردن</Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
