"use client";

import { useEffect, useRef, useState } from "react";

const DEFAULT_VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260307_083826_e938b29f-a43a-41ec-a153-3d4730578ab8.mp4";

/**
 * Fixed, full-viewport ambient background: gridlines + two soft accent
 * glows, an autoplaying muted video dissolved in once it can actually play,
 * and a dark gradient scrim on top so foreground text stays readable.
 */
export function BackgroundVideo({ videoUrl = DEFAULT_VIDEO_URL }: { videoUrl?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoOk, setVideoOk] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const check = () => {
      const ok = v.videoWidth > 0 && v.readyState >= 2;
      setVideoOk((prev) => (prev === ok ? prev : ok));
    };

    const events = ["loadeddata", "canplay", "timeupdate", "error", "stalled"] as const;
    events.forEach((event) => v.addEventListener(event, check));

    const playPromise = v.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }

    return () => {
      events.forEach((event) => v.removeEventListener(event, check));
    };
  }, [videoUrl]);

  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden>
      <div
        className="absolute inset-0 bg-surface-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 1100px 700px at 78% 8%, rgba(245,169,62,.13), transparent 62%), " +
            "radial-gradient(ellipse 900px 600px at 6% 88%, rgba(63,209,192,.10), transparent 60%), " +
            "repeating-linear-gradient(90deg, rgba(255,255,255,.035) 0 1px, transparent 1px 84px)",
        }}
      />
      <video
        ref={videoRef}
        src={videoUrl || undefined}
        muted
        loop
        autoPlay
        playsInline
        preload="auto"
        className="absolute inset-0 w-full h-full object-cover transition-opacity duration-400 ease-out"
        style={{
          filter: "saturate(.55) contrast(1.05)",
          opacity: videoOk ? 0.5 : 0,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(11,12,14,.42) 0%, rgba(11,12,14,.55) 45%, rgba(11,12,14,.68) 100%)",
        }}
      />
    </div>
  );
}
