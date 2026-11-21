"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge } from "@/components/design";
import { RequireAuth } from "@/components/RequireAuth";
import { ErrorBox, Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { formatCountdown, formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/messages";
import type { AppointmentDetail } from "@/lib/types";

const CHECKS = ["اتاق آرام و روشن", "مدارک هویتی آماده", "لیست داروها یادداشت شده", "اتریت اینترنت پایدار"];

/** اتاق انتظار مجازی — شمارش معکوس، چکلیست و تست دستگاهها قبل از ویزیت. */
function Waiting() {
  const { id } = useParams<{ id: string }>();
  const { api } = useAuth();
  const [a, setA] = useState<AppointmentDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [done, setDone] = useState<string[]>([]);
  const [media, setMedia] = useState<"idle" | "ok" | "denied">("idle");

  const load = useCallback(async () => {
    try { setA(await api.get<AppointmentDetail>(`/appointments/${id}`)); }
    catch (e) { setErr(errorMessage(e)); }
  }, [api, id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    try { setDone(JSON.parse(localStorage.getItem(`nvy-waiting-${id}`) ?? "[]") as string[]); } catch { /* ignore */ }
  }, [id]);

  const toggle = (c: string) => {
    setDone((p) => {
      const next = p.includes(c) ? p.filter((x) => x !== c) : [...p, c];
      try { localStorage.setItem(`nvy-waiting-${id}`, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const testMedia = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      s.getTracks().forEach((t) => t.stop());
      setMedia("ok");
    } catch { setMedia("denied"); }
  };

  if (!a) return err ? <ErrorBox message={err} /> : <Loading />;
  const seconds = Math.max(0, Math.floor((new Date(a.startsAt).getTime() - now) / 1000));
  return (
    <div className="stack">
      <header className="page-head">
        <div><h1>اتاق انتظار</h1><p className="muted">آمادگی خود را قبل از ویزیت بررسی کنید</p></div>
        <Badge tone={seconds <= 300 ? "ok" : "info"}>{formatCountdown(seconds)}</Badge>
      </header>
      <Alert tone="info" title={`زمان ویزیت: ${formatDateTime(a.startsAt)}`}>پزشک {a.doctor.fullName} — {a.kind === "IN_PERSON" ? "ویزیت حضوری" : "ویزیت آنلاین"}</Alert>
      <section className="card stack">
        <h2 className="fs-lg m-0">چکلیست آمادگی</h2>
        {CHECKS.map((c) => (
          <label key={c} className="check"><input type="checkbox" checked={done.includes(c)} onChange={() => toggle(c)} />{c}</label>
        ))}
        <div className="row gap-2 wrap">
          <button className="btn" type="button" onClick={() => void testMedia()}>تست دوربین و میکروفون</button>
          {media === "ok" && <Badge tone="ok">دستگاهها آمادهاند</Badge>}
          {media === "denied" && <Badge tone="bad">دسترسی داده نشد — تنظیمات مرورگر را بررسی کنید</Badge>}
        </div>
      </section>
      <Link className="btn btn-primary self-start" href={`/appointments/${id}/video`}>ورود به اتاق ویدئو</Link>
    </div>
  );
}

export default function WaitingPage() {
  return <RequireAuth><Waiting /></RequireAuth>;
}
