"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, CoinBurst, motion } from "@/components/motion/primitives";
import { useReducedMotion } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

const TONES = {
  ok: { box: "bg-ok/[0.07] text-ok border-ok/25", chip: "bg-ok/15", path: "M4 8.5l2.8 2.8L12 5.5" },
  warn: { box: "bg-warn/[0.07] text-warn border-warn/25", chip: "bg-warn/15", path: "M8 4.5v4M8 11.2v.3" },
  bad: { box: "bg-bad/[0.07] text-bad border-bad/25", chip: "bg-bad/15", path: "M5 5l6 6M11 5l-6 6" },
} as const;

/** Animated flash banner for PayPal return states. `celebrate` adds a one-shot coin burst. */
export function FlashBanner({ tone, title, children, celebrate = false }: { tone: keyof typeof TONES; title: string; children?: ReactNode; celebrate?: boolean }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(true);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (!celebrate || reduce) return;
    const t = setTimeout(() => setBurst(1), 350);
    return () => clearTimeout(t);
  }, [celebrate, reduce]);
  const t = TONES[tone];
  return (
    <AnimatePresence initial>
      {open && (
        <motion.div
          role={tone === "ok" ? "status" : "alert"}
          initial={reduce ? false : { opacity: 0, y: -14, scale: 0.98, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className={`relative overflow-visible rounded-2xl border px-4 py-3.5 backdrop-blur-sm ${t.box}`}
        >
          <div className="flex items-start gap-3">
            <motion.span
              className={`grid size-7 shrink-0 place-items-center rounded-full ${t.chip}`}
              initial={reduce ? false : { scale: 0, rotate: -40 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 18, delay: 0.15 }}
              aria-hidden
            >
              <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <motion.path d={t.path} initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 0.3 }} />
              </svg>
            </motion.span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">{title}</p>
              {children && <p className="mt-0.5 text-ink/75 break-words">{children}</p>}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="-m-1 rounded-full p-1.5 opacity-60 transition hover:bg-ink/5 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
              aria-label="Dismiss message"
            >
              <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
              </svg>
            </button>
          </div>
          {celebrate && (
            <div className="pointer-events-none absolute inset-y-0 left-6 w-40" aria-hidden>
              <CoinBurst trigger={burst} label="Funded" />
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
