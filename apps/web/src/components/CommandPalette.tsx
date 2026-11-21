"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import type { AppointmentList, DoctorSearch, RecordItem } from "@/lib/types";

type Result = { id: string; title: string; sub: string; href: string; group: string };

/** Command Palette زمینهیی با Ctrl+K — جستجوی پزشک، نوبت و پرونده بدون ترک صفحه. */
export function CommandPalette() {
  const { api, status } = useAuth();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Result[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((v) => !v); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 0); }, [open]);

  useEffect(() => {
    if (!open || q.trim().length < 2 || status !== "authed") { setItems([]); return; }
    const t = setTimeout(async () => {
      try {
        const term = q.trim();
        const [docs, appts, recs] = await Promise.all([
          api.get<DoctorSearch>(`/doctors?q=${encodeURIComponent(term)}&limit=5`).catch(() => null),
          api.get<AppointmentList>("/appointments?limit=8").catch(() => null),
          api.get<{ items: RecordItem[] }>("/records?limit=5").catch(() => null),
        ]);
        const out: Result[] = [];
        for (const d of docs?.items ?? []) out.push({ id: `d-${d.id}`, title: d.fullName, sub: d.specialties.map((s) => s.nameFa).join("، "), href: `/doctors/${d.id}`, group: "پزشکان" });
        for (const a of appts?.items ?? []) if (a.doctor.fullName.includes(term)) out.push({ id: `a-${a.id}`, title: a.doctor.fullName, sub: `${a.startsAt.slice(0, 10)} — ${a.status}`, href: `/appointments/${a.id}`, group: "نوبتهای من" });
        for (const r of recs?.items ?? []) if (r.title.includes(term)) out.push({ id: `r-${r.id}`, title: r.title, sub: r.category, href: `/records/${r.id}`, group: "پرونده سلامت" });
        setItems(out.slice(0, 12));
        setActive(0);
      } catch { setItems([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [api, open, q, status]);

  const groups = useMemo(() => Array.from(new Set(items.map((i) => i.group))), [items]);
  if (!open) return null;

  return (
    <div className="cmd-overlay" role="dialog" aria-label="جستجوی سریع" onMouseDown={() => setOpen(false)}>
      <div className="cmd-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cmd-head">
          <span aria-hidden="true">⌕</span>
          <input ref={inputRef} className="cmd-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="پزشک، نوبت یا پرونده را جستجو کنید…" aria-label="جستجو"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === "Enter" && items[active]) { window.location.href = items[active]!.href; setOpen(false); }
            }} />
          <button className="btn btn-sm ghost" type="button" onClick={() => setOpen(false)}>Esc</button>
        </div>
        <div className="cmd-results">
          {q.trim().length < 2 ? <p className="muted small cmd-empty">حداقل ۲ حرف وارد کنید.</p> : items.length === 0 ? <p className="muted small cmd-empty">نتیجهای یافت نشد.</p> : groups.map((g) => (
            <section key={g} className="cmd-group">
              <h3>{g}</h3>
              {items.filter((i) => i.group === g).map((it) => (
                <Link key={it.id} href={it.href} className={`cmd-item ${items.indexOf(it) === active ? "active" : ""}`} onClick={() => setOpen(false)}>
                  <strong>{it.title}</strong><span className="muted small">{it.sub}</span>
                </Link>
              ))}
            </section>
          ))}
        </div>
        <p className="muted small cmd-hint">Ctrl+K برای باز/بسته · Esc برای خروج</p>
      </div>
    </div>
  );
}
