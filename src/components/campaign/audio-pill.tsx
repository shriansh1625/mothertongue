"use client";

import { useEffect, useRef, useState } from "react";

const EVT = "mt-audio-play";

function fmt(s: number) {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

/**
 * Compact audio player. Progress and time are written straight to the DOM on
 * `timeupdate` (no per-frame React state). Only one clip plays at a time.
 */
export function AudioPill({ src, label, duration }: { src: string; label: string; duration?: number | null }) {
  const audio = useRef<HTMLAudioElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const time = useRef<HTMLSpanElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent).detail !== audio.current) audio.current?.pause();
    };
    window.addEventListener(EVT, onOther);
    return () => window.removeEventListener(EVT, onOther);
  }, []);

  const paint = () => {
    const a = audio.current;
    if (!a) return;
    const d = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : duration ?? 0;
    const p = d > 0 ? Math.min(1, a.currentTime / d) : 0;
    if (bar.current) bar.current.style.transform = `scaleX(${p})`;
    if (time.current) time.current.textContent = a.currentTime > 0 ? fmt(a.currentTime) : fmt(d);
  };

  const toggle = async () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      window.dispatchEvent(new CustomEvent(EVT, { detail: a }));
      setLoading(true);
      try {
        await a.play();
        setFailed(false);
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    } else a.pause();
  };

  const seek = (clientX: number, el: HTMLElement) => {
    const a = audio.current;
    if (!a || !Number.isFinite(a.duration)) return;
    const r = el.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * a.duration;
    paint();
  };

  return (
    <div className={`flex w-full min-w-0 items-center gap-2.5 rounded-full border border-line bg-white/70 py-1 pl-1 pr-3 sm:w-56 ${playing ? "ring-2 ring-accent/15" : ""}`}>
      <button
        type="button"
        onClick={toggle}
        aria-label={`${playing ? "Pause" : "Play"} recording: ${label}`}
        aria-pressed={playing}
        className={`grid size-8 shrink-0 place-items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 ${playing ? "bg-accent text-white" : "bg-ink text-paper hover:bg-black"}`}
      >
        {loading ? (
          <svg className="size-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
            <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        ) : playing ? (
          <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden>
            <rect x="4" y="3" width="3" height="10" rx="1" />
            <rect x="9" y="3" width="3" height="10" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" className="ml-0.5 size-3.5" fill="currentColor" aria-hidden>
            <path d="M4.5 2.8v10.4a.6.6 0 00.9.5l8.2-5.2a.6.6 0 000-1L5.4 2.3a.6.6 0 00-.9.5z" />
          </svg>
        )}
      </button>
      <div
        className="relative h-1.5 flex-1 cursor-pointer overflow-hidden rounded-full bg-paper-2"
        onPointerDown={(e) => seek(e.clientX, e.currentTarget)}
        aria-hidden
      >
        <div ref={bar} className="absolute inset-0 origin-left rounded-full bg-accent transition-transform duration-200 ease-linear" style={{ transform: "scaleX(0)" }} />
      </div>
      <span ref={time} className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted">
        {failed ? "err" : fmt(duration ?? 0)}
      </span>
      <audio
        ref={audio}
        preload="none"
        playsInline
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          if (audio.current) audio.current.currentTime = 0;
          paint();
        }}
        onTimeUpdate={paint}
        onLoadedMetadata={paint}
        onError={() => {
          setFailed(true);
          setLoading(false);
        }}
        className="hidden"
      />
    </div>
  );
}
