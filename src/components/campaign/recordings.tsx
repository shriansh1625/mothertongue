"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "@/components/motion/primitives";
import { useReducedMotion } from "motion/react";
import { PayoutBadge, VerdictBadge } from "@/components/badges";
import { AudioPill } from "./audio-pill";

export type RecordingItem = {
  id: string;
  prompt_text: string;
  transcript: string | null;
  explanation_en: string | null;
  match_score: number | null;
  judge: string | null;
  verdict: string;
  payout_status: string;
  price_cents: number;
  speaker: string;
  duration_s: number | null;
};

const EASE = [0.22, 1, 0.36, 1] as const;
const PAGE = 24;
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

const TABS = [
  { key: "all", label: "All" },
  { key: "accepted", label: "Verified" },
  { key: "review", label: "Needs review" },
  { key: "rejected", label: "Rejected" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function Similarity({ score }: { score: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, score)) * 100);
  const color = score >= 0.8 ? "var(--ok)" : score >= 0.55 ? "var(--warn)" : "var(--bad)";
  return (
    <span className="inline-flex items-center gap-2" title={`Text similarity between the sentence and what Whisper heard: ${pct}%`}>
      <span className="text-[11px] font-medium text-muted">Similarity</span>
      <span
        className="relative h-1.5 w-16 overflow-hidden rounded-full bg-paper-2 sm:w-20"
        role="meter"
        aria-label="Similarity"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <motion.span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          whileInView={{ width: `${pct}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.1 }}
        />
      </span>
      <span className="font-mono text-[11px] tabular-nums" style={{ color }}>
        {pct}%
      </span>
    </span>
  );
}

function Row({ c, i }: { c: RecordingItem; i: number }) {
  const reduce = useReducedMotion();
  const rail = c.verdict === "accepted" ? "bg-ok/60" : c.verdict === "rejected" ? "bg-bad/50" : "bg-warn/60";
  return (
    <motion.li
      layout={reduce ? false : "position"}
      initial={reduce ? false : { opacity: 0, y: 14, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={reduce ? undefined : { opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
      transition={{ duration: 0.5, ease: EASE, delay: Math.min(i % PAGE, 10) * 0.04 }}
      className="group relative rounded-2xl border border-line/80 bg-white/55 p-4 transition-colors hover:border-ink/15 hover:bg-white sm:p-5"
    >
      <span aria-hidden className={`absolute bottom-5 left-0 top-5 w-[3px] rounded-r-full ${rail}`} />
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="min-w-0">
          <p className="script text-lg leading-snug text-ink">{c.prompt_text}</p>
          <div className="mt-2 flex items-start gap-2">
            <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md bg-paper-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
              <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
                <rect x="5.5" y="1.8" width="5" height="8" rx="2.5" />
                <path d="M3.2 7.5a4.8 4.8 0 009.6 0M8 12.3v2" />
              </svg>
              AI heard
            </span>
            <p className={`script min-w-0 break-words ${c.transcript ? "text-ink/70" : "italic text-muted"}`}>{c.transcript ? `“${c.transcript}”` : "-"}</p>
          </div>
          {c.explanation_en && <p className="mt-2 text-sm text-muted">{c.explanation_en}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {typeof c.match_score === "number" && <Similarity score={c.match_score} />}
            {c.judge && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
                <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
                  <path d="M8 1.5l1.6 3.6 3.9.4-2.9 2.6.8 3.9L8 10l-3.4 2 .8-3.9L2.5 5.5l3.9-.4L8 1.5z" />
                </svg>
                <span className="sr-only">Judge model</span>
                <span className="rounded-md border border-line bg-paper-2/60 px-1.5 py-0.5 font-mono text-ink/70">{c.judge}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
              <span aria-hidden className="grid size-5 place-items-center rounded-full bg-accent/10 text-[10px] font-semibold uppercase text-accent-ink">
                {c.speaker.trim().charAt(0) || "?"}
              </span>
              <span className="sr-only">Speaker</span>
              <span className="text-ink/75">{c.speaker}</span>
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-3 md:w-56 md:items-end">
          <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
            <VerdictBadge verdict={c.verdict} />
            {c.verdict === "accepted" && <PayoutBadge status={c.payout_status} />}
            {c.verdict === "accepted" && <span className="font-mono text-xs tabular-nums text-ink/70">{usd(c.price_cents)}</span>}
          </div>
          <AudioPill src={`/api/clips/${c.id}/audio`} label={c.prompt_text} duration={c.duration_s} />
        </div>
      </div>
    </motion.li>
  );
}

/** Recordings list with verdict filter tabs (sliding pill), staggered rows and paging. */
export function Recordings({ clips }: { clips: RecordingItem[] }) {
  const [tab, setTab] = useState<TabKey>("all");
  const [limit, setLimit] = useState(PAGE);
  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { all: clips.length, accepted: 0, review: 0, rejected: 0 };
    for (const x of clips) if (x.verdict in c) c[x.verdict as TabKey]++;
    return c;
  }, [clips]);
  const filtered = tab === "all" ? clips : clips.filter((c) => c.verdict === tab);
  const shown = filtered.slice(0, limit);

  return (
    <div className="mt-5">
      <div role="tablist" aria-label="Filter recordings by AI verdict" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => {
                setTab(t.key);
                setLimit(PAGE);
              }}
              className={`relative shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${active ? "text-paper" : "text-muted hover:text-ink"}`}
            >
              {active && <motion.span layoutId="rec-tab-pill" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <span className="relative inline-flex items-center gap-1.5">
                {t.label}
                <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${active ? "bg-paper/15" : "bg-paper-2"}`}>{counts[t.key]}</span>
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">No recordings in this view.</p>
      ) : (
        <ul className="mt-4 space-y-3" role="tabpanel" aria-label={`${TABS.find((t) => t.key === tab)?.label} recordings`}>
          <AnimatePresence mode="popLayout" initial>
            {shown.map((c, i) => (
              <Row key={c.id} c={c} i={i} />
            ))}
          </AnimatePresence>
        </ul>
      )}

      {filtered.length > limit && (
        <div className="mt-4 flex justify-center">
          <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="btn btn-ghost text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
            Show more ({filtered.length - limit} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
