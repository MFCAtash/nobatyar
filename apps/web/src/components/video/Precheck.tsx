"use client";
import { cssVars } from "@/lib/css";
import { useCallback, useEffect, useRef, useState } from "react";
import { mediaErrorMessage } from "@/lib/video-window";
import { ErrorBox } from "../ui";

export interface JoinOptions {
  camera: boolean;
  mic: boolean;
  videoDeviceId?: string;
  audioDeviceId?: string;
}

/** بررسی دوربین/میکروفون پیش از ورود: پیش‌نمایش، انتخاب دستگاه، نمایشگر سطح صدا. */
export function Precheck({ peerLabel, onJoin, joining }: { peerLabel: string; onJoin: (o: JoinOptions) => void; joining: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cam, setCam] = useState(true);
  const [mic, setMic] = useState(true);
  const [videoId, setVideoId] = useState<string>();
  const [audioId, setAudioId] = useState<string>();
  const [devices, setDevices] = useState<{ video: MediaDeviceInfo[]; audio: MediaDeviceInfo[] }>({ video: [], audio: [] });
  const [err, setErr] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    let raf = 0;
    let ctx: AudioContext | null = null;
    stop();
    setErr(null);
    setLevel(0);
    if (!cam && !mic) return;

    (async () => {
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: cam ? { deviceId: videoId ? { exact: videoId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
          audio: mic ? { deviceId: audioId ? { exact: audioId } : undefined, echoCancellation: true, noiseSuppression: true } : false,
        });
      } catch (e) {
        if (cancelled) return;
        setErr(mediaErrorMessage((e as DOMException)?.name));
        return;
      }
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      // نام دستگاه‌ها فقط پس از اجازه‌ی دسترسی در دسترس است
      const all = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
      if (!cancelled) setDevices({ video: all.filter((d) => d.kind === "videoinput"), audio: all.filter((d) => d.kind === "audioinput") });

      if (mic && stream.getAudioTracks().length > 0) {
        try {
          ctx = new AudioContext();
          const an = ctx.createAnalyser();
          an.fftSize = 512;
          ctx.createMediaStreamSource(stream).connect(an);
          const buf = new Uint8Array(an.fftSize);
          const loop = () => {
            an.getByteTimeDomainData(buf);
            let sum = 0;
            for (const v of buf) { const x = (v - 128) / 128; sum += x * x; }
            setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
            raf = requestAnimationFrame(loop);
          };
          loop();
        } catch { /* نمایشگر سطح صدا اختیاری است */ }
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      void ctx?.close();
    };
  }, [cam, mic, videoId, audioId, supported, stop]);

  useEffect(() => stop, [stop]);

  const join = () => {
    stop(); // دستگاه‌ها آزاد شوند تا اتاق خودش آن‌ها را بگیرد
    onJoin({ camera: cam, mic, videoDeviceId: videoId, audioDeviceId: audioId });
  };

  if (!supported) {
    return (
      <div className="card stack mw-md mx-auto">
        <h1 className="fs-lg m-0">ویزیت تصویری</h1>
        <ErrorBox message="مرورگر شما دسترسی به دوربین/میکروفون را پشتیبانی نمی‌کند یا صفحه با HTTPS باز نشده است." />
      </div>
    );
  }

  return (
    <div className="card stack mw-lg mx-auto">
      <h1 className="fs-lg m-0">آماده‌ی ورود به ویزیت</h1>
      <p className="muted small m-0">ویزیت با {peerLabel}. پیش از ورود تصویر و صدای خود را بررسی کنید.</p>

      <div className="call-preview">
        {cam ? <video ref={videoRef} autoPlay muted playsInline className="call-mirror" aria-label="پیش‌نمایش دوربین" /> : <div className="call-off">دوربین خاموش است</div>}
      </div>

      {mic && (
        <div className="stack gap-1">
          <span className="label">سطح صدای میکروفون</span>
          <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)} aria-label="سطح صدای میکروفون">
            <div className="meter-fill" style={cssVars({ "--level": `${Math.round(level * 100)}%` })} />
          </div>
          <span className="help">اگر صحبت می‌کنید و نوار تکان نمی‌خورد، میکروفون دیگری انتخاب کنید.</span>
        </div>
      )}

      <ErrorBox message={err} />

      <div className="row">
        <button className={`btn btn-sm ${cam ? "" : "btn-danger"}`} aria-pressed={cam} onClick={() => setCam((v) => !v)}>{cam ? "دوربین روشن" : "دوربین خاموش"}</button>
        <button className={`btn btn-sm ${mic ? "" : "btn-danger"}`} aria-pressed={mic} onClick={() => setMic((v) => !v)}>{mic ? "میکروفون روشن" : "میکروفون خاموش"}</button>
      </div>

      {devices.video.length > 1 && cam && (
        <label className="field"><span className="label">دوربین</span>
          <select className="input" value={videoId ?? ""} onChange={(e) => setVideoId(e.target.value || undefined)}>
            <option value="">پیش‌فرض</option>
            {devices.video.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `دوربین ${i + 1}`}</option>)}
          </select>
        </label>
      )}
      {devices.audio.length > 1 && mic && (
        <label className="field"><span className="label">میکروفون</span>
          <select className="input" value={audioId ?? ""} onChange={(e) => setAudioId(e.target.value || undefined)}>
            <option value="">پیش‌فرض</option>
            {devices.audio.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `میکروفون ${i + 1}`}</option>)}
          </select>
        </label>
      )}

      {!cam && !mic && <div className="note-box">اگر هر دو خاموش باشند، طرف مقابل شما را نمی‌بیند و نمی‌شنود. بعداً هم می‌توانید روشن کنید.</div>}

      <button className="btn btn-primary btn-block" disabled={joining} onClick={join}>{joining ? "در حال اتصال…" : "ورود به ویزیت"}</button>
    </div>
  );
}
