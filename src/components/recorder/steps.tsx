"use client";
import { motion } from "motion/react";

const STEPS = [
  { title: "Join", hint: "Name + PayPal email" },
  { title: "Record", hint: "Read short sentences" },
  { title: "Get paid", hint: "via PayPal" },
];

/** Join -> Record -> Get paid via PayPal indicator. `current` is the 0-based active step. */
export function SpeakerSteps({ current = 0, className = "" }: { current?: number; className?: string }) {
  return (
    <ol className={`grid grid-cols-3 gap-2 ${className}`} aria-label="How it works">
      {STEPS.map((s, i) => {
        const state = i < current ? "done" : i === current ? "active" : "todo";
        return (
          <li key={s.title} className="relative flex flex-col gap-2" aria-current={state === "active" ? "step" : undefined}>
            <div className="flex items-center gap-2">
              <span
                className={`relative grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors ${
                  state === "done"
                    ? "bg-ok text-white"
                    : state === "active"
                      ? "bg-ink text-paper"
                      : i === 2
                        ? "bg-[#ffc439]/35 text-ppblue"
                        : "bg-paper-2 text-muted"
                }`}
              >
                {state === "active" && (
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-full border-2 border-ink/30"
                    animate={{ scale: [1, 1.45], opacity: [0.8, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                  />
                )}
                {state === "done" ? (
                  <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 6.5l2.2 2.2L9.5 3.5" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              {i < STEPS.length - 1 && (
                <span aria-hidden className="relative h-px flex-1 overflow-hidden bg-line">
                  <motion.span
                    className="absolute inset-y-0 left-0 bg-ink"
                    initial={{ width: 0 }}
                    animate={{ width: i < current ? "100%" : "0%" }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  />
                </span>
              )}
            </div>
            <div className="leading-tight">
              <p className={`text-sm font-semibold ${state === "todo" ? "text-muted" : "text-ink"}`}>{s.title}</p>
              <p className={`text-xs ${i === 2 ? "text-ppblue" : "text-muted"}`}>{s.hint}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
