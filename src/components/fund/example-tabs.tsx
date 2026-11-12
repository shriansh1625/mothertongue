"use client";

import { LayoutGroup, motion } from "motion/react";

export type FundExample = { language: string; brief: string; native: string; short: string; topic: string };

/** Example language presets as segmented tabs with a spring-animated sliding pill (shared layoutId). */
export function ExampleTabs({ examples, active, onPick }: { examples: FundExample[]; active: string; onPick: (ex: FundExample) => void }) {
  return (
    <LayoutGroup id="fund-examples">
      <div role="group" aria-label="Start from an example brief" className="grid grid-cols-3 gap-1 rounded-2xl border border-line bg-paper-2/70 p-1">
        {examples.map((ex) => {
          const on = active === ex.language;
          return (
            <motion.button
              type="button"
              key={ex.language}
              onClick={() => onPick(ex)}
              aria-pressed={on}
              aria-label={`Use example: ${ex.language}, ${ex.topic}`}
              whileTap={{ scale: 0.96 }}
              className={`relative flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-2 sm:gap-2 sm:px-3 text-sm font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper-2 ${
                on ? "text-paper" : "text-ink/75 hover:text-ink hover:bg-white/60"
              }`}
            >
              {on && (
                <motion.span
                  layoutId="fund-example-pill"
                  aria-hidden
                  className="absolute inset-0 rounded-xl bg-ink shadow-[0_6px_16px_-8px_rgba(31,27,22,0.6)]"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className={`script relative z-10 text-base leading-none ${on ? "text-[#ffb98a]" : "text-accent"}`} aria-hidden>
                {ex.native}
              </span>
              <span className="relative z-10 truncate">
                {ex.short}
                <span className={`ml-1 hidden sm:inline ${on ? "text-paper/60" : "text-muted"}`}>· {ex.topic}</span>
              </span>
            </motion.button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
