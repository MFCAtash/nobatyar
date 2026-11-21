import type { Track as LkTrack } from "livekit-client";
import { useEffect, useRef } from "react";

export function VideoTile({ track, mirror = false, label, speaking = false, micMuted = false, camOff = false }: {
  track: LkTrack | undefined; mirror?: boolean; label: string; speaking?: boolean; micMuted?: boolean; camOff?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    track.attach(el);
    return () => { track.detach(el); };
  }, [track]);
  return (
    <div className={`tile${speaking ? " tile-speaking" : ""}`}>
      {track && !camOff
        ? <video ref={ref} autoPlay playsInline muted className={mirror ? "call-mirror" : undefined} aria-label={label} />
        : <div className="call-off"><span className="avatar" aria-hidden>{label.trim().charAt(0) || "؟"}</span></div>}
      <span className="tile-label">{label}{micMuted ? " 🔇" : ""}</span>
    </div>
  );
}
