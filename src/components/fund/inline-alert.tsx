"use client";

import { AnimatePresence, motion } from "motion/react";

/** Animated inline error: expands in, shakes on each new message, dismissible. */
export function InlineAlert({ message, onDismiss }: { message: string | null; onDismiss?: () => void }) {
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.div
          key="alert"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          <motion.div
            key={message}
            role="alert"
            initial={{ x: 0 }}
            animate={{ x: [0, -6, 6, -3, 3, 0] }}
            transition={{ duration: 0.4 }}
            className="flex items-start gap-3 rounded-xl border border-bad/25 bg-bad/[0.06] px-4 py-3 text-sm text-bad"
          >
            <svg viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0" fill="currentColor" aria-hidden>
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-12a.9.9 0 0 1 .9.9v3.6a.9.9 0 1 1-1.8 0V6.9A.9.9 0 0 1 10 6Zm0 8.4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                clipRule="evenodd"
              />
            </svg>
            <div className="flex-1">
              <p className="font-semibold">We couldn&apos;t design that campaign</p>
              <p className="mt-0.5 text-bad/90">{message}</p>
            </div>
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss error"
                className="-mr-1 -mt-0.5 rounded-md p-1 text-bad/70 outline-none transition hover:bg-bad/10 hover:text-bad focus-visible:ring-2 focus-visible:ring-bad"
              >
                <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
