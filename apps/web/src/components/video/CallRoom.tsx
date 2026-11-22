"use client";
import type { Room as LkRoom } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { formatCountdown } from "@/lib/format";
import { errorMessage } from "@/lib/messages";
import type { ActionResult, AppointmentDetail, VideoJoin } from "@/lib/types";
import { mediaErrorMessage, qualityLabel } from "@/lib/video-window";
import { ErrorBox, Modal } from "../ui";
import type { JoinOptions } from "./Precheck";
import { VideoTile } from "./VideoTile";

type Lk = typeof import("livekit-client");
export type ExitReason = "left" | "ended" | "duplicate" | "dropped" | "connect_failed";

export function CallRoom({ join, initial, appointment, onExit, onAppointmentChange }: {
  join: VideoJoin;
  initial: JoinOptions;
  appointment: AppointmentDetail;
  onExit: (r: ExitReason) => void;
  onAppointmentChange: (a: AppointmentDetail) => void;
}) {
  const { api } = useAuth();
  const roomRef = useRef<LkRoom | null>(null);
  const audioBox = useRef<HTMLDivElement>(null);
  const leavingRef = useRef(false);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const [lk, setLk] = useState<Lk | null>(null);
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);
  const [conn, setConn] = useState<"connecting" | "connected" | "reconnecting">("connecting");
  const [quality, setQuality] = useState<string>();
  const [mic, setMic] = useState(false);
  const [cam, setCam] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [speaking, setSpeaking] = useState<string[]>([]);
  const [needAudio, setNeedAudio] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"leave" | "complete" | null>(null);
  const [settings, setSettings] = useState(false);
  const [devs, setDevs] = useState<{ video: MediaDeviceInfo[]; audio: MediaDeviceInfo[] }>({ video: [], audio: [] });
  const [now, setNow] = useState(Date.now());

  const isDoctor = join.role === "doctor";
  const peerName = join.peer.fullName || (isDoctor ? "بیمار" : "پزشک");
  const myName = isDoctor ? appointment.doctor.fullName : (appointment.patient.fullName || "من");

  // ───────────── اتصال به اتاق ─────────────
  useEffect(() => {
    let cancelled = false;
    let room: LkRoom | undefined;

    (async () => {
      const mod = await import("livekit-client");
      if (cancelled) return;
      setLk(mod);

      room = new mod.Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: { deviceId: initial.videoDeviceId, resolution: mod.VideoPresets.h540.resolution },
        audioCaptureDefaults: { deviceId: initial.audioDeviceId, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        publishDefaults: { simulcast: true },
      });
      roomRef.current = room;
      const r = room;

      r.on(mod.RoomEvent.ConnectionStateChanged, (s) => {
        const v = String(s);
        setConn(v === "connected" ? "connected" : v === "reconnecting" || v === "signalReconnecting" ? "reconnecting" : "connecting");
      });
      r.on(mod.RoomEvent.Disconnected, (reason) => {
        if (leavingRef.current) return;
        const name = reason === undefined ? "" : String(mod.DisconnectReason[reason as number]);
        onExitRef.current(name === "ROOM_DELETED" ? "ended" : name === "DUPLICATE_IDENTITY" ? "duplicate" : "dropped");
      });
      r.on(mod.RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === mod.Track.Kind.Audio && audioBox.current) audioBox.current.appendChild(track.attach());
        bump();
      });
      r.on(mod.RoomEvent.TrackUnsubscribed, (track) => {
        if (track.kind === mod.Track.Kind.Audio) track.detach().forEach((el) => el.remove());
        bump();
      });
      for (const ev of [
        mod.RoomEvent.ParticipantConnected, mod.RoomEvent.ParticipantDisconnected,
        mod.RoomEvent.TrackMuted, mod.RoomEvent.TrackUnmuted,
        mod.RoomEvent.LocalTrackPublished, mod.RoomEvent.LocalTrackUnpublished,
        mod.RoomEvent.TrackPublished, mod.RoomEvent.TrackUnpublished,
      ]) r.on(ev, bump);
      r.on(mod.RoomEvent.ActiveSpeakersChanged, (sp) => setSpeaking(sp.map((p) => p.identity)));
      r.on(mod.RoomEvent.ConnectionQualityChanged, (q, p) => { if (p.isLocal) setQuality(String(q)); });
      r.on(mod.RoomEvent.AudioPlaybackStatusChanged, () => setNeedAudio(!r.canPlaybackAudio));
      r.on(mod.RoomEvent.MediaDevicesError, (e) => setErr(mediaErrorMessage((e as { name?: string })?.name)));

      try {
        await r.connect(join.url, join.token, { autoSubscribe: true });
      } catch {
        if (!cancelled) onExitRef.current("connect_failed");
        return;
      }
      if (cancelled) { void r.disconnect(); return; }
      setConn("connected");

      // خطای دوربین نباید ویزیت صوتی را خراب کند: هر کدام جدا
      if (initial.mic) {
        try { await r.localParticipant.setMicrophoneEnabled(true); setMic(true); }
        catch (e) { setErr(mediaErrorMessage((e as { name?: string })?.name)); }
      }
      if (initial.camera) {
        try { await r.localParticipant.setCameraEnabled(true); setCam(true); }
        catch (e) { setErr(mediaErrorMessage((e as { name?: string })?.name)); }
      }
      bump();
    })();

    return () => {
      cancelled = true;
      leavingRef.current = true;
      void room?.disconnect();
      roomRef.current = null;
    };
    // اتصال فقط یک‌بار به‌ازای mount؛ join/initial عمداً ثابت‌اند (توکن جدید = mount جدید)
  }, []);

  // ساعت، نگه‌داشتن صفحه روشن، هشدار بستن تب، به‌روزرسانی وضعیت نوبت
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const req = async () => { try { lock = (await navigator.wakeLock?.request("screen")) ?? null; } catch { /* پشتیبانی نشده */ } };
    void req();
    const vis = () => { if (document.visibilityState === "visible") void req(); };
    document.addEventListener("visibilitychange", vis);
    return () => { document.removeEventListener("visibilitychange", vis); void lock?.release(); };
  }, []);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  useEffect(() => {
    const t = setInterval(async () => {
      try { onAppointmentChange(await api.get<AppointmentDetail>(`/appointments/${appointment.id}`)); } catch { /* موقت */ }
    }, 15_000);
    return () => clearInterval(t);
  }, [api, appointment.id, onAppointmentChange]);

  // ───────────── اقدام‌ها ─────────────
  const toggle = async (kind: "mic" | "cam" | "screen") => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    try {
      if (kind === "mic") { await lp.setMicrophoneEnabled(!mic); setMic(!mic); }
      else if (kind === "cam") { await lp.setCameraEnabled(!cam); setCam(!cam); }
      else { await lp.setScreenShareEnabled(!sharing); setSharing(!sharing); }
      setErr(null);
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (!(kind === "screen" && name === "NotAllowedError")) setErr(mediaErrorMessage(name)); // لغو انتخاب صفحه خطا نیست
    }
    bump();
  };

  const leave = () => {
    leavingRef.current = true;
    void roomRef.current?.disconnect();
    onExit("left");
  };

  const run = async (action: "start" | "complete") => {
    setBusy(action); setErr(null);
    try {
      await api.post<ActionResult>(`/appointments/${appointment.id}/${action}`);
      onAppointmentChange(await api.get<AppointmentDetail>(`/appointments/${appointment.id}`));
      if (action === "complete") { leavingRef.current = true; onExit("ended"); }
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(null); setConfirm(null); }
  };

  const openSettings = async () => {
    setSettings((v) => !v);
    const all = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
    setDevs({ video: all.filter((d) => d.kind === "videoinput"), audio: all.filter((d) => d.kind === "audioinput") });
  };
  const switchDev = async (kind: "audioinput" | "videoinput", id: string) => {
    try { await roomRef.current?.switchActiveDevice(kind, id); } catch (e) { setErr(mediaErrorMessage((e as { name?: string })?.name)); }
  };

  // ───────────── وضعیت نمایش ─────────────
  const room = roomRef.current;
  const peer = room ? Array.from(room.remoteParticipants.values())[0] : undefined;
  const src = lk?.Track.Source;
  const peerCam = peer && src ? peer.getTrackPublication(src.Camera) : undefined;
  const peerScreen = peer && src ? peer.getTrackPublication(src.ScreenShare) : undefined;
  const peerMic = peer && src ? peer.getTrackPublication(src.Microphone) : undefined;
  const myCam = room && src ? room.localParticipant.getTrackPublication(src.Camera) : undefined;

  const endsInSec = Math.floor((new Date(appointment.endsAt).getTime() - now) / 1000);
  const q = qualityLabel(quality);
  const status = appointment.status;
  const canStart = isDoctor && status === "CONFIRMED";
  const canComplete = isDoctor && status === "IN_PROGRESS";
  const screenOk = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;

  return (
    <div className="stack">
      <div ref={audioBox} aria-hidden className="hidden" />
      <div className="row between">
        <div className="row">
          <h1 className="fs-md m-0">ویزیت با {peerName}</h1>
          <span className={`badge badge-${q.tone}`}>{q.text}</span>
        </div>
        <span className="num muted small" aria-label="زمان باقی‌مانده تا پایان نوبت">
          {endsInSec > 0 ? `پایان نوبت: ${formatCountdown(endsInSec)}` : "زمان نوبت به پایان رسیده"}
        </span>
      </div>

      <div className="call-stage">
        {peerScreen?.track ? (
          <VideoTile track={peerScreen.track} label={`صفحه‌ی ${peerName}`} />
        ) : (
          <VideoTile track={peerCam?.track} label={peerName} speaking={!!peer && speaking.includes(peer.identity)} micMuted={!!peer && !!peerMic?.isMuted} camOff={!peer || !!peerCam?.isMuted} />
        )}
        <div className="call-pip">
          <VideoTile track={myCam?.track} mirror label={`${myName} (شما)`} camOff={!cam} micMuted={!mic} />
        </div>

        {conn !== "connected" && (
          <div className="call-overlay" role="status" aria-live="polite">
            {conn === "reconnecting" ? "اتصال قطع شد؛ در حال اتصال دوباره…" : "در حال اتصال…"}
          </div>
        )}
        {conn === "connected" && !peer && (
          <div className="call-overlay" role="status" aria-live="polite">
            {isDoctor ? "منتظر ورود بیمار…" : "پزشک هنوز وارد نشده است. به‌محض ورود، ویزیت شروع می‌شود."}
          </div>
        )}
      </div>

      {needAudio && <div className="note-box"><button className="btn btn-sm btn-primary" onClick={() => void roomRef.current?.startAudio().then(() => setNeedAudio(false))}>فعال‌کردن صدا</button> مرورگر پخش خودکار صدا را مسدود کرده است.</div>}
      <ErrorBox message={err} />

      <div className="call-bar" role="toolbar" aria-label="کنترل ویزیت">
        <button className={`btn ${mic ? "" : "btn-danger"}`} aria-pressed={mic} disabled={conn !== "connected"} onClick={() => void toggle("mic")}>{mic ? "میکروفون" : "میکروفون خاموش"}</button>
        <button className={`btn ${cam ? "" : "btn-danger"}`} aria-pressed={cam} disabled={conn !== "connected"} onClick={() => void toggle("cam")}>{cam ? "دوربین" : "دوربین خاموش"}</button>
        {screenOk && <button className={`btn ${sharing ? "btn-primary" : ""}`} aria-pressed={sharing} disabled={conn !== "connected"} onClick={() => void toggle("screen")}>{sharing ? "توقف اشتراک" : "اشتراک صفحه"}</button>}
        <button className="btn btn-ghost" aria-expanded={settings} onClick={() => void openSettings()}>دستگاه‌ها</button>
        {canStart && <button className="btn btn-primary" disabled={!!busy} onClick={() => void run("start")}>شروع ویزیت</button>}
        {canComplete && <button className="btn btn-primary" disabled={!!busy} onClick={() => setConfirm("complete")}>پایان ویزیت</button>}
        <button className="btn btn-danger" onClick={() => setConfirm("leave")}>خروج</button>
      </div>

      {settings && (
        <div className="card stack">
          <label className="field"><span className="label">دوربین</span>
            <select className="input" defaultValue="" onChange={(e) => e.target.value && void switchDev("videoinput", e.target.value)}>
              <option value="">— انتخاب —</option>
              {devs.video.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `دوربین ${i + 1}`}</option>)}
            </select>
          </label>
          <label className="field"><span className="label">میکروفون</span>
            <select className="input" defaultValue="" onChange={(e) => e.target.value && void switchDev("audioinput", e.target.value)}>
              <option value="">— انتخاب —</option>
              {devs.audio.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `میکروفون ${i + 1}`}</option>)}
            </select>
          </label>
        </div>
      )}

      {confirm === "leave" && (
        <Modal title="خروج از ویزیت" onClose={() => setConfirm(null)}>
          <p>{isDoctor ? "با خروج، ویزیت پایان نمی‌یابد و می‌توانید دوباره وارد شوید. برای ثبت پایان ویزیت از «پایان ویزیت» استفاده کنید." : "با خروج می‌توانید تا پایان زمان نوبت دوباره وارد شوید."}</p>
          <div className="row mt-4">
            <button className="btn btn-danger" onClick={leave}>بله، خارج شوم</button>
            <button className="btn btn-ghost" onClick={() => setConfirm(null)}>انصراف</button>
          </div>
        </Modal>
      )}
      {confirm === "complete" && (
        <Modal title="پایان ویزیت" onClose={() => setConfirm(null)}>
          <p>با پایان ویزیت، تماس برای هر دو طرف قطع می‌شود و دیگر نمی‌توان وارد شد.</p>
          <ErrorBox message={err} />
          <div className="row mt-4">
            <button className="btn btn-primary" disabled={!!busy} onClick={() => void run("complete")}>پایان ویزیت</button>
            <button className="btn btn-ghost" onClick={() => setConfirm(null)}>انصراف</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
