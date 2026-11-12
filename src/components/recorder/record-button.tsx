"use client";
/**
 * The big record control: concentric rings while recording, a voice-reactive halo driven by a
 * motion value (no React re-render per frame) and an SVG countdown ring for the maximum length.
 */
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { useEffect } from "react";

type Mode = "idle" | "retry" | "recording" | "checking";

const SIZE = 184;
const STROKE = 5;
const R = (SIZE - STROKE) / 2 - 6;

export function RecordButton({
  mode,
  seconds,
  maxSeconds,
  level,
  onStart,
  onStop,
}: {
  mode: Mode;
  seconds: number;
  maxSeconds: number;
  level: MotionValue<number>;
  onStart: () => void;
  onStop: () => void;
}) {
  const reduce = useReducedMotion();
  const progress = useMotionValue(0);
  const halo = useTransform(level, [0, 1], [1, 1.32]);
  const haloOpacity = useTransform(level, [0, 0.05, 1], [0.25, 0.45, 0.9]);
  const recording = mode === "recording";

  // smooth countdown sweep for the full max duration (stopped and reset when recording ends)
  useEffect(() => {
    if (!recording) {
      progress.set(0);
      return;
    }
    progress.set(0);
    const a = animate(progress, 1, { duration: maxSeconds, ease: "linear" });
    return () => a.stop();
  }, [recording, maxSeconds, progress]);

  const left = Math.max(0, maxSeconds - seconds);

  return (
    <div className="relative grid place-items-center" style={{ width: SIZE, height: SIZE }}>
      {/* concentric rings */}
      {recording &&
        !reduce &&
        [0, 1, 2].map((i) => (
          <motion.span
            key={i}
            aria-hidden
            className="absolute inset-6 rounded-full border-2 border-accent/50"
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 1.75, opacity: 0 }}
            transition={{ duration: 2.1, repeat: Infinity, ease: "easeOut", delay: i * 0.7 }}
          />
        ))}

      {/* voice-reactive halo */}
      {recording && (
        <motion.span aria-hidden className="absolute inset-7 rounded-full bg-accent/25 blur-md" style={{ scale: halo, opacity: haloOpacity }} />
      )}

      {/* countdown ring */}
      <svg aria-hidden width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 -rotate-90">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--line)" strokeWidth={STROKE} opacity={recording ? 1 : 0.6} />
        {recording && (
          <motion.circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            style={{ pathLength: progress }}
          />
        )}
      </svg>

      {mode === "checking" ? (
        <div role="status" aria-label="Checking" className="relative grid size-32 place-items-center rounded-full bg-paper-2">
          <motion.svg
            aria-hidden
            width="128"
            height="128"
            viewBox="0 0 128 128"
            className="absolute inset-0"
            animate={reduce ? undefined : { rotate: 360 }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
          >
            <circle cx="64" cy="64" r="60" fill="none" stroke="var(--ink)" strokeWidth="4" strokeLinecap="round" strokeDasharray="90 400" />
          </motion.svg>
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Checking</span>
        </div>
      ) : (
        <motion.button
          type="button"
          onClick={recording ? onStop : onStart}
          aria-label={recording ? `Stop recording, ${left} seconds left` : mode === "retry" ? "Record again" : "Start recording"}
          aria-pressed={recording}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.94 }}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
          className={`relative grid size-32 place-items-center rounded-full font-semibold shadow-[0_18px_40px_-18px_rgba(31,27,22,0.6)] outline-none focus-visible:ring-4 focus-visible:ring-accent/40 focus-visible:ring-offset-4 focus-visible:ring-offset-paper ${
            recording ? "bg-accent text-white" : "bg-ink text-paper hover:bg-black"
          }`}
        >
          <span className="flex flex-col items-center gap-1.5">
            {recording ? (
              <motion.span
                key="stop"
                initial={{ scale: 0.4, borderRadius: 999 }}
                animate={{ scale: 1, borderRadius: 6 }}
                transition={{ type: "spring", stiffness: 380, damping: 20 }}
                className="block size-7 bg-white"
                aria-hidden
              />
            ) : (
              <MicIcon />
            )}
            <span className="text-sm leading-none">{recording ? "Stop" : mode === "retry" ? "Retry" : "Record"}</span>
            {recording && <span className="font-mono text-[11px] leading-none tabular-nums text-white/85">{left}s left</span>}
          </span>
        </motion.button>
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg aria-hidden width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2.5" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3.5" />
    </svg>
  );
}
