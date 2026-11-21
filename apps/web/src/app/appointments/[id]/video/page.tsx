"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { ErrorBox, Loading } from "@/components/ui";
import { CallRoom, ExitReason } from "@/components/video/CallRoom";
import { JoinOptions, Precheck } from "@/components/video/Precheck";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatCountdown, formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/messages";
import type { AppointmentDetail, VideoJoin, VideoStatus } from "@/lib/types";

type Phase = "loading" | "blocked" | "precheck" | "live" | "left";

const EXIT_TEXT: Record<ExitReason, string> = {
  left: "از ویزیت خارج شدید.",
  ended: "ویزیت پایان یافت.",
  duplicate: "این ویزیت در تب یا دستگاه دیگری باز شد و این اتصال بسته شد.",
  dropped: "اتصال شما قطع شد.",
  connect_failed: "اتصال به اتاق ویزیت برقرار نشد.",
};

function VideoVisit() {
  const { id } = useParams<{ id: string }>();
  const { api } = useAuth();
  const [a, setA] = useState<AppointmentDetail | null>(null);
  const [vs, setVs] = useState<VideoStatus | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [err, setErr] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [joining, setJoining] = useState(false);
  const [join, setJoin] = useState<VideoJoin | null>(null);
  const [opts, setOpts] = useState<JoinOptions | null>(null);
  const [exit, setExit] = useState<ExitReason | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const [appt, status] = await Promise.all([
        api.get<AppointmentDetail>(`/appointments/${id}`),
        api.get<VideoStatus>(`/appointments/${id}/video`),
      ]);
      setA(appt); setVs(status); setErr(null);
      setPhase((p) => (p === "loading" || p === "blocked" ? (status.available && status.state === "OPEN" ? "precheck" : "blocked") : p));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNotFound(true); else setErr(errorMessage(e));
    }
  }, [api, id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // در حالت «هنوز زود است»، لحظه‌ی باز شدن پنجره صفحه خودش را تازه می‌کند
  useEffect(() => {
    if (phase !== "blocked" || vs?.state !== "TOO_EARLY" || !vs.opensAt) return;
    if (now >= new Date(vs.opensAt).getTime()) void load();
  }, [phase, vs, now, load]);

  const startJoin = async (o: JoinOptions) => {
    setJoining(true); setErr(null);
    try {
      const j = await api.post<VideoJoin>(`/appointments/${id}/video/token`);
      setOpts(o); setJoin(j); setPhase("live");
    } catch (e) {
      setErr(errorMessage(e));
      if (e instanceof ApiError && e.status !== 429) void load();
    } finally { setJoining(false); }
  };

  const onExit = useCallback((r: ExitReason) => { setExit(r); setJoin(null); setPhase("left"); void load(); }, [load]);

  if (notFound) return <div className="empty">نوبت پیدا نشد.</div>;
  if (!a || !vs || phase === "loading") return err ? <ErrorBox message={err} /> : <Loading />;

  const peerLabel = vs.peer.fullName || (vs.role === "doctor" ? "بیمار" : "پزشک");
  const back = <Link href={`/appointments/${id}`} className="btn btn-ghost btn-sm">بازگشت به جزئیات نوبت</Link>;

  if (phase === "live" && join && opts) {
    return <CallRoom join={join} initial={opts} appointment={a} onExit={onExit} onAppointmentChange={setA} />;
  }

  if (phase === "precheck") {
    return <div className="stack"><Precheck peerLabel={peerLabel} onJoin={(o) => void startJoin(o)} joining={joining} /><div className="mw-lg mx-auto w-full"><ErrorBox message={err} /></div></div>;
  }

  if (phase === "left") {
    const canRejoin = exit !== "ended" && vs.state === "OPEN";
    return (
      <div className="card stack mw-md mx-auto">
        <h1 className="fs-lg m-0">{exit ? EXIT_TEXT[exit] : "ویزیت"}</h1>
        {exit === "dropped" || exit === "connect_failed" ? <p className="muted">اینترنت خود را بررسی کنید؛ تا پایان زمان نوبت می‌توانید دوباره وارد شوید.</p> : null}
        <ErrorBox message={err} />
        <div className="row">
          {canRejoin && <button className="btn btn-primary" onClick={() => setPhase("precheck")}>ورود دوباره</button>}
          {back}
        </div>
      </div>
    );
  }

  // blocked
  const opensAt = vs.opensAt ? new Date(vs.opensAt) : null;
  const left = opensAt ? Math.max(0, Math.floor((opensAt.getTime() - now) / 1000)) : 0;
  return (
    <div className="card stack mw-md mx-auto">
      <h1 className="fs-lg m-0">ویزیت تصویری</h1>
      {!vs.available && <div className="note-box">سرویس ویزیت تصویری فعلاً در دسترس نیست. کمی بعد دوباره امتحان کنید.</div>}
      {vs.available && vs.state === "TOO_EARLY" && opensAt && (
        <div className="note-box">
          ورود به ویزیت از <strong>{formatDateTime(opensAt)}</strong> فعال می‌شود (حدود <strong className="num">{formatCountdown(left)}</strong> دیگر).
          <br />این صفحه در زمان مناسب خودش آماده‌ی ورود می‌شود.
        </div>
      )}
      {vs.available && vs.state === "ENDED" && <div className="note-box">زمان این ویزیت به پایان رسیده است.</div>}
      {vs.available && vs.state === "NOT_VIDEO" && <div className="note-box">این نوبت از نوع ویزیت تصویری نیست.</div>}
      {vs.available && vs.state === "UNAVAILABLE" && <div className="note-box">وضعیت نوبت ({a.status === "PENDING_CONFIRMATION" ? "در انتظار تأیید پزشک" : "غیرقابل ورود"}) اجازه‌ی ورود به ویزیت را نمی‌دهد.</div>}
      <ErrorBox message={err} />
      <div className="row">{back}</div>
    </div>
  );
}

export default function VideoPage() {
  return <RequireAuth><VideoVisit /></RequireAuth>;
}
