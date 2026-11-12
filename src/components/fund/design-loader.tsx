"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { WaveBars } from "@/components/motion/primitives";

const LINES = [
  "Reading your brief…",
  "Writing native-script sentences with GPT-OSS 120B…",
  "Checking for personal data and brand names…",
  "Pricing fair pay per clip…",
];

// Deterministic skeleton widths (no Math.random, so no hydration drift).
const ROWS = [
  [82, 46],
  [64, 38],
  [91, 52],
  [58, 34],
  [74, 44],
];

/** Full-card overlay shown while POST /api/campaigns runs (typically 3-10 s). */
export function DesignLoader({ language, count }: { language: string; count: number }) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, LINES.length - 1)), 2300);
    return () => clearInterval(t);
  }, []);

  const rows = ROWS.slice(0, Math.max(3, Math.min(ROWS.length, Number.isFinite(count) ? count : 5)));

  return (
    <motion.div
      key="design-loader"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 z-20 flex flex-col overflow-hidden bg-[#fffdf9]/95 p-6 backdrop-blur-sm sm:p-8"
    >
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-accent/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-16 size-72 rounded-full bg-ok/10 blur-3xl" />

      <div className="relative flex items-center gap-4">
        <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-ink shadow-[0_10px_30px_-12px_rgba(31,27,22,0.7)]">
          <WaveBars bars={9} className="h-7" color="#fbf7f0" />
        </div>
        <div className="min-w-0">
          <p className="label text-accent">AI is designing your campaign</p>
          <p className="font-display mt-0.5 truncate text-xl font-semibold">{language.trim() || "Your language"}</p>
        </div>
      </div>

      {/* Rotating status line */}
      <div className="relative mt-6" role="status" aria-live="polite">
        <div className="relative h-7 overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.p
              key={i}
              className="absolute inset-x-0 truncate text-[15px] font-medium text-ink"
              initial={reduce ? { opacity: 0 } : { y: 18, opacity: 0, filter: "blur(6px)" }}
              animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
              exit={reduce ? { opacity: 0 } : { y: -18, opacity: 0, filter: "blur(6px)" }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              {LINES[i]}
            </motion.p>
          </AnimatePresence>
        </div>
        <div className="mt-3 flex gap-1.5" aria-hidden>
          {LINES.map((_, k) => (
            <div key={k} className="relative h-1 flex-1 overflow-hidden rounded-full bg-paper-2">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full bg-accent"
                initial={false}
                animate={{ width: k < i ? "100%" : k === i ? "60%" : "0%", opacity: k === i ? 0.75 : 1 }}
                transition={{ duration: k === i ? 2 : 0.4, ease: "easeOut" }}
              />
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Usually takes 3 to 10 seconds. Please keep this tab open.</p>
      </div>

      {/* Skeleton of the prompt list being written */}
      <div className="relative mt-6 rounded-2xl border border-line bg-white/70 p-4" aria-hidden>
        <div className="flex items-center justify-between">
          <span className="label">Draft recording prompts</span>
          <span className="pill border-line bg-paper-2 text-muted">{Number.isFinite(count) ? count : "?"} sentences</span>
        </div>
        <ul className="mt-3 space-y-3">
          {rows.map(([a, b], k) => (
            <motion.li
              key={k}
              className="flex items-start gap-3"
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + k * 0.12, duration: 0.4 }}
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-paper-2 text-[11px] font-semibold text-muted">{k + 1}</span>
              <div className="flex-1 space-y-1.5 pt-0.5">
                <div className="shimmer h-3.5 rounded-full bg-[#efe5d6]" style={{ width: `${a}%` }} />
                <div className="shimmer h-2.5 rounded-full bg-paper-2" style={{ width: `${b}%` }} />
              </div>
            </motion.li>
          ))}
        </ul>
      </div>

      <p className="relative mt-auto flex items-center gap-2 pt-6 text-xs text-muted">
        <span className="size-1.5 shrink-0 rounded-full bg-ok" aria-hidden />
        Nothing is charged yet. You review the prompts before funding with PayPal.
      </p>
    </motion.div>
  );
}
