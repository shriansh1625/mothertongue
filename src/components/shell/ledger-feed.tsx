"use client";
/**
 * Ledger timeline with a filter tab bar (sliding pill via layoutId). Receives events as props from
 * the server page; AutoRefresh on the page re-renders it with fresh rows, which fade in here.
 */
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type LedgerEvent = { id: number; kind: string; ref: string | null; summary: string; created_at: string };

type Group = "paypal" | "ai" | "agent";
type Filter = "all" | Group;

const EASE = [0.22, 1, 0.36, 1] as const;

const GROUPS: Record<Group, { label: string; dot: string; node: string; pill: string; line: string }> = {
  paypal: {
    label: "PayPal",
    dot: "bg-ppblue",
    node: "bg-ppblue/[0.08] text-ppblue ring-ppblue/20",
    pill: "bg-ppblue/10 text-ppblue border-ppblue/20",
    line: "bg-ppblue/70",
  },
  ai: {
    label: "AI",
    dot: "bg-accent",
    node: "bg-accent/[0.08] text-accent ring-accent/20",
    pill: "bg-accent/10 text-accent-ink border-accent/20",
    line: "bg-accent/70",
  },
  agent: {
    label: "Agent",
    dot: "bg-ok",
    node: "bg-ok/[0.08] text-ok ring-ok/20",
    pill: "bg-ok/10 text-ok border-ok/20",
    line: "bg-ok/70",
  },
};

const FALLBACK = { node: "bg-paper-2 text-muted ring-line", pill: "bg-paper-2 text-muted border-line", line: "bg-line" };

const TABS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "paypal", label: "PayPal" },
  { id: "ai", label: "AI" },
  { id: "agent", label: "Agent" },
];

function groupOf(kind: string): Group | null {
  const g = kind.split(".")[0];
  return g === "paypal" || g === "ai" || g === "agent" ? g : null;
}

/* ---------- icons (16px, stroke = currentColor) ---------- */
function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}
const ICONS: Record<string, ReactNode> = {
  "paypal.api": (
    <Svg>
      <path d="M7 7h11l-3-3M17 17H6l3 3" />
    </Svg>
  ),
  "paypal.webhook": (
    <Svg>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </Svg>
  ),
  "paypal.order": (
    <Svg>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6M9 12h6" />
    </Svg>
  ),
  "paypal.capture": (
    <Svg>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.5 2.5L16 9.5" />
    </Svg>
  ),
  "paypal.refund": (
    <Svg>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </Svg>
  ),
  "paypal.payout": (
    <Svg>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
    </Svg>
  ),
  "ai.llm": (
    <Svg>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="m12 8 1.3 2.7L16 12l-2.7 1.3L12 16l-1.3-2.7L8 12l2.7-1.3L12 8Z" />
    </Svg>
  ),
  "ai.stt": (
    <Svg>
      <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />
    </Svg>
  ),
  "ai.judge": (
    <Svg>
      <path d="M12 4v16M7 20h10M5 8h14" />
      <path d="m5 8-2.5 6a2.5 2.5 0 0 0 5 0L5 8ZM19 8l-2.5 6a2.5 2.5 0 0 0 5 0L19 8Z" />
    </Svg>
  ),
  "ai.design": (
    <Svg>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </Svg>
  ),
  "agent.settle": (
    <Svg>
      <rect x="5" y="8" width="14" height="11" rx="3" />
      <path d="M12 4v4M9.5 13h.01M14.5 13h.01M10 16h4" />
    </Svg>
  ),
};
const GROUP_ICON: Record<Group | "other", ReactNode> = {
  paypal: ICONS["paypal.api"],
  ai: ICONS["ai.llm"],
  agent: ICONS["agent.settle"],
  other: (
    <Svg>
      <circle cx="12" cy="12" r="3" />
    </Svg>
  ),
};

/* ---------- time formatting (fixed locale + UTC, so server and client agree) ---------- */
function parseUtc(s: string): Date | null {
  const iso = s.includes("T") ? s : `${s.replace(" ", "T")}Z`;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
const DAY = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
const TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

function dayKey(e: LedgerEvent) {
  return e.created_at.slice(0, 10);
}

export function LedgerFeed({ events }: { events: LedgerEvent[] }) {
  const reduce = useReducedMotion();
  const [filter, setFilter] = useState<Filter>("all");
  // Highest id present on first render: anything above it arrived via auto-refresh and is flagged "new".
  const [baseline] = useState(() => events.reduce((m, e) => Math.max(m, e.id), 0));
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: events.length, paypal: 0, ai: 0, agent: 0 };
    const kinds = new Map<string, number>();
    for (const e of events) {
      const g = groupOf(e.kind);
      if (g) c[g]++;
      kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
    }
    return { c, kinds };
  }, [events]);

  const visible = useMemo(() => (filter === "all" ? events : events.filter((e) => groupOf(e.kind) === filter)), [events, filter]);

  const days = useMemo(() => {
    const out: { key: string; label: string; items: LedgerEvent[] }[] = [];
    for (const e of visible) {
      const k = dayKey(e);
      let bucket = out[out.length - 1];
      if (!bucket || bucket.key !== k) {
        const d = parseUtc(e.created_at);
        bucket = { key: k, label: d ? DAY.format(d) : k, items: [] };
        out.push(bucket);
      }
      bucket.items.push(e);
    }
    return out;
  }, [visible]);

  const breakdown = useMemo(
    () =>
      [...counts.kinds.entries()]
        .filter(([k]) => filter === "all" || groupOf(k) === filter)
        .sort((a, b) => b[1] - a[1]),
    [counts.kinds, filter],
  );

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    else return;
    e.preventDefault();
    setFilter(TABS[next].id);
    tabRefs.current[next]?.focus();
  }

  return (
    <div>
      {/* Filter bar */}
      <div className="sticky top-16 z-10 -mx-5 border-b border-line/60 bg-paper/85 px-5 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div role="tablist" aria-label="Filter ledger events" className="inline-flex w-fit max-w-full overflow-x-auto rounded-full [scrollbar-width:none] border border-line bg-white/80 p-1 shadow-[0_1px_0_rgba(31,27,22,0.04)] backdrop-blur">
            {TABS.map((t, i) => {
              const on = filter === t.id;
              const g = t.id === "all" ? null : GROUPS[t.id];
              return (
                <button
                  key={t.id}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`ledger-tab-${t.id}`}
                  aria-selected={on}
                  aria-controls="ledger-panel"
                  tabIndex={on ? 0 : -1}
                  onClick={() => setFilter(t.id)}
                  onKeyDown={(e) => onTabKey(e, i)}
                  className={`relative flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1.5 text-[13px] sm:gap-2 sm:px-3.5 sm:text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    on ? "text-paper" : "text-muted hover:text-ink"
                  }`}
                >
                  {on && (
                    <motion.span
                      layoutId="ledger-tab-pill"
                      aria-hidden
                      className="absolute inset-0 rounded-full bg-ink"
                      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  <span className="relative flex items-center gap-1.5 sm:gap-2">
                    {g && <span aria-hidden className={`size-1.5 rounded-full ${g.dot}`} />}
                    {t.label}
                    <span className={`rounded-full px-1 text-[11px] sm:px-1.5 tabular-nums ${on ? "bg-white/15 text-paper" : "bg-paper-2 text-muted"}`}>{counts.c[t.id]}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted" aria-live="polite">
            Showing {visible.length} of the latest {events.length} event{events.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {/* Per-kind breakdown */}
      {breakdown.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Event counts by kind">
          {breakdown.map(([k, n]) => {
            const g = groupOf(k);
            return (
              <li key={k} className={`pill font-mono font-medium ${g ? GROUPS[g].pill : FALLBACK.pill}`}>
                {k}
                <span className="tabular-nums opacity-70">×{n}</span>
              </li>
            );
          })}
        </ul>
      )}

      {/* Timeline */}
      <div id="ledger-panel" role="tabpanel" aria-labelledby={`ledger-tab-${filter}`} className="mt-8">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={filter}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: EASE }}
          >
            {days.length === 0 ? (
              <div className="card flex flex-col items-center gap-2 px-6 py-14 text-center">
                <span className="grid size-10 place-items-center rounded-full bg-paper-2 text-muted ring-1 ring-line">{GROUP_ICON[filter === "all" ? "other" : filter]}</span>
                <p className="font-medium">No {filter === "all" ? "" : `${GROUPS[filter].label} `}activity yet.</p>
                <p className="text-sm text-muted">Events appear here the moment they happen.</p>
              </div>
            ) : (
              <div className="space-y-10">
                {days.map((d) => (
                  <section key={d.key} aria-label={d.label}>
                    <h2 className="mb-3 inline-flex sm:sticky sm:top-20 sm:z-[5] items-center gap-2 rounded-full border border-line bg-paper/90 px-3 py-1 text-xs font-semibold text-muted backdrop-blur">
                      {d.label}
                      <span className="font-normal tabular-nums">· {d.items.length}</span>
                    </h2>
                    <ol className="relative">
                      {/* spine */}
                      <span aria-hidden className="absolute bottom-3 left-[17px] top-3 w-px bg-gradient-to-b from-line via-line to-transparent" />
                      <AnimatePresence initial={false}>
                        {d.items.map((e) => (
                          <Row key={e.id} e={e} isNew={e.id > baseline} reduce={!!reduce} />
                        ))}
                      </AnimatePresence>
                    </ol>
                  </section>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Row({ e, isNew, reduce }: { e: LedgerEvent; isNew: boolean; reduce: boolean }) {
  const g = groupOf(e.kind);
  const tone = g ? GROUPS[g] : FALLBACK;
  const d = parseUtc(e.created_at);
  return (
    <motion.li
      className="relative flex gap-4 pb-3 last:pb-0"
      initial={reduce ? false : { opacity: 0, y: -10, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, paddingBottom: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      <span className={`relative z-[1] mt-2 grid size-[35px] shrink-0 place-items-center rounded-full bg-[#fffdf9] ring-1 ${tone.node}`}>
        {ICONS[e.kind] ?? GROUP_ICON[g ?? "other"]}
      </span>
      <motion.div
        className="group relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-line bg-[#fffdf9] px-4 py-3 shadow-[0_1px_0_rgba(31,27,22,0.03)] transition-[border-color,box-shadow] duration-200 hover:border-ink/15 hover:shadow-[0_10px_28px_-20px_rgba(31,27,22,0.4)]"
        initial={isNew && !reduce ? { backgroundColor: "rgba(194,65,12,0.08)" } : false}
        animate={{ backgroundColor: "rgba(255,253,249,1)" }}
        transition={{ duration: 2.4, ease: "easeOut" }}
      >
        <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${tone.line}`} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={`pill font-mono ${tone.pill}`}>{e.kind}</span>
          {isNew && (
            <span className="pill border-accent/30 bg-accent text-white" aria-label="New event">
              New
            </span>
          )}
          <time dateTime={d?.toISOString() ?? e.created_at} className="ml-auto font-mono text-xs tabular-nums text-muted" title={`${e.created_at} UTC`}>
            {d ? TIME.format(d) : e.created_at} UTC
          </time>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-ink">{e.summary}</p>
        {e.ref && (
          <p className="mt-1 truncate font-mono text-xs text-muted" title={e.ref}>
            ref {e.ref}
          </p>
        )}
      </motion.div>
    </motion.li>
  );
}
