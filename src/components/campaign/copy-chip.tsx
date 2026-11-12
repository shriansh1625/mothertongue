"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "@/components/motion/primitives";

/** Monospace ID chip (PayPal capture / refund / batch IDs) with copy-to-clipboard. */
export function CopyChip({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <button
      type="button"
      title={`Copy ${label} ${value}`}
      aria-label={`Copy ${label} ID ${value}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1400);
        } catch {}
      }}
      className={`group inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line bg-paper-2/70 px-2 py-1 font-mono text-[11px] leading-none text-ink/80 transition hover:border-ink/25 hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${className}`}
    >
      <span className="font-sans text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      <span className="truncate">{value}</span>
      <span className="relative grid size-3.5 shrink-0 place-items-center text-muted group-hover:text-ink" aria-hidden>
        <AnimatePresence mode="wait" initial={false}>
          {copied ? (
            <motion.svg key="ok" viewBox="0 0 16 16" className="size-3.5 text-ok" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }}>
              <path d="M3.5 8.5l3 3 6-7" />
            </motion.svg>
          ) : (
            <motion.svg key="copy" viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }}>
              <rect x="5.5" y="5.5" width="8" height="8" rx="1.8" />
              <path d="M10.5 3.5v-.2A1.3 1.3 0 009.2 2H3.3A1.3 1.3 0 002 3.3v5.9a1.3 1.3 0 001.3 1.3h.2" />
            </motion.svg>
          )}
        </AnimatePresence>
      </span>
      <span className="sr-only" aria-live="polite">{copied ? "Copied" : ""}</span>
    </button>
  );
}
