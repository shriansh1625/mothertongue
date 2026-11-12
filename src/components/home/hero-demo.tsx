"use client";
/**
 * Hero "live pipeline" card: a looping ILLUSTRATION of the real flow
 * (record -> Whisper transcript -> Qwen3 verdict -> PayPal Payouts).
 * Numbers here are illustrative, never metrics. Pauses when offscreen; with
 * reduced motion it starts paused on the finished pipeline.
 */
import { animate, AnimatePresence, motion, MotionConfig, useInView, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { CoinBurst, WaveBars } from "@/components/motion/primitives";

const EASE = [0.22, 1, 0.36, 1] as const;

type Lang = {
  code: string;
  name: string;
  native: string;
  sentence: string;
  feedback: string;
  feedbackGloss: string;
  similarity: number;
  seconds: number;
};

const LANGS: Lang[] = [
  {
    code: "hi",
    name: "Hindi",
    native: "हिन्दी",
    sentence: "मेरे सिर में दर्द है।",
    feedback: "बहुत बढ़िया! रिकॉर्डिंग साफ़ है।",
    feedbackGloss: "Great job! The recording is clear.",
    similarity: 97,
    seconds: 2.4,
  },
  {
    code: "tl",
    name: "Tagalog",
    native: "Tagalog",
    sentence: "Masakit ang ulo ko.",
    feedback: "Magaling! Malinaw ang recording.",
    feedbackGloss: "Well done! The recording is clear.",
    similarity: 95,
    seconds: 2.1,
  },
  {
    code: "sw",
    name: "Swahili",
    native: "Kiswahili",
    sentence: "Kichwa changu kinauma.",
    feedback: "Hongera! Sauti iko wazi.",
    feedbackGloss: "Congratulations! The audio is clear.",
    similarity: 96,
    seconds: 2.3,
  },
];

const STEPS = ["Record", "Transcribe", "Verify", "Pay"] as const;
const STEP_MS = [2800, 2600, 3000, 2800];

const noopSubscribe = () => () => {};

export function HeroDemo() {
  // useReducedMotion is null on the server; gate on mount so the first client render matches SSR
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const reduce = (useReducedMotion() ?? false) && mounted;
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-60px" });
  const [s, setS] = useState({ lang: 0, step: 0, burst: 0 });
  // null = untouched: autoplay unless the user prefers reduced motion.
  const [playing, setPlaying] = useState<boolean | null>(null);
  const isPlaying = playing ?? !reduce;
  const running = isPlaying && inView;
  const step = playing === null && !isPlaying ? 3 : s.step;
  const lang = LANGS[s.lang];

  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => {
      setS((p) =>
        p.step < 3
          ? { ...p, step: p.step + 1, burst: p.step + 1 === 3 ? p.burst + 1 : p.burst }
          : { lang: (p.lang + 1) % LANGS.length, step: 0, burst: p.burst },
      );
    }, STEP_MS[s.step]);
    return () => clearTimeout(t);
  }, [running, s.step, s.lang]);

  const pickLang = (i: number) => setS((p) => ({ lang: i, step: 0, burst: p.burst }));
  const pickStep = (i: number) => {
    setS((p) => ({ ...p, step: i, burst: i === 3 ? p.burst + 1 : p.burst }));
    if (playing === null && !isPlaying) setPlaying(false);
  };

  return (
    <MotionConfig reducedMotion="user">
      <figure ref={ref} className="relative m-0">
        {/* soft halo behind the card */}
        <div aria-hidden className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-accent/15 via-transparent to-ok/15 blur-2xl" />
        <div className="card glow-ring relative p-5 sm:p-6">
          {/* header */}
          <div className="flex items-center justify-between gap-3">
            <p className="label flex items-center gap-2">
              <span className="relative flex size-2">
                {running && <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent/60 motion-reduce:hidden" />}
                <span className={`relative inline-flex size-2 rounded-full ${running ? "bg-accent" : "bg-muted/50"}`} />
              </span>
              How a clip flows
            </p>
            <button
              type="button"
              onClick={() => setPlaying(!isPlaying)}
              className="grid size-8 place-items-center rounded-full border border-line text-muted transition hover:bg-paper-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              aria-label={isPlaying ? "Pause the illustration" : "Play the illustration"}
            >
              {isPlaying ? (
                <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden fill="currentColor">
                  <rect x="3.5" y="3" width="3" height="10" rx="1" />
                  <rect x="9.5" y="3" width="3" height="10" rx="1" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden fill="currentColor">
                  <path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5z" />
                </svg>
              )}
            </button>
          </div>

          {/* language tabs with a sliding pill */}
          <div role="tablist" aria-label="Example language" className="mt-4 inline-flex rounded-full border border-line bg-paper-2/70 p-1">
            {LANGS.map((l, i) => {
              const active = i === s.lang;
              return (
                <button
                  key={l.code}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => pickLang(i)}
                  className={`relative rounded-full px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    active ? "text-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="hero-demo-lang-pill"
                      className="absolute inset-0 rounded-full bg-[#fffdf9] shadow-sm ring-1 ring-line"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  <span className={`relative ${l.code === "hi" ? "script" : ""}`}>{l.native}</span>
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={lang.code}
              initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
              transition={{ duration: 0.45, ease: EASE }}
            >
              {/* prompt */}
              <div className="mt-4 rounded-2xl border border-line/70 bg-paper-2/60 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Prompt · {lang.name}</p>
                <p lang={lang.code} className="script mt-1 text-2xl font-medium text-ink">
                  {lang.sentence}
                </p>
                <p className="text-sm text-muted">“My head hurts.”</p>
              </div>

              {/* pipeline rows */}
              <ol className="mt-4 space-y-1">
                <Row index={0} step={step} title="Recording" icon={<MicIcon />}>
                  <div className="flex min-h-12 items-center gap-3">
                    <WaveBars
                      bars={30}
                      active={step === 0 && running && !reduce}
                      color={step === 0 ? "var(--accent)" : "var(--muted)"}
                      className={`h-10 transition-opacity ${step === 0 ? "" : "opacity-50"}`}
                    />
                    <span className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-xs text-muted">
                      {step === 0 ? (
                        <span className="size-1.5 rounded-full bg-accent motion-safe:animate-pulse" aria-hidden />
                      ) : (
                        <CheckIcon className="text-ok" />
                      )}
                      <Timer key={lang.code} seconds={lang.seconds} mode={step > 0 ? "done" : running && !reduce ? "live" : "paused"} />
                    </span>
                  </div>
                </Row>

                <Row index={1} step={step} title="Whisper heard" icon={<EarIcon />} badge={step >= 1 ? `lang: ${lang.code}` : undefined}>
                  <div className="min-h-8">
                    {step >= 1 ? (
                      <TypeWords key={lang.code} text={lang.sentence} lang={lang.code} caret={step === 1} />
                    ) : (
                      <Skeleton widths={["w-3/4"]} />
                    )}
                  </div>
                </Row>

                <Row index={2} step={step} title="Qwen3 verdict" icon={<ScaleIcon />}>
                  <div className="min-h-[4.25rem]">
                    <AnimatePresence mode="wait" initial={false}>
                      {step >= 2 ? (
                        <motion.div
                          key="verdict"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.4, ease: EASE }}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <motion.span
                              className="pill bg-ok/12 text-ok ring-1 ring-ok/25"
                              initial={{ scale: 0.85 }}
                              animate={{ scale: 1 }}
                              transition={{ type: "spring", stiffness: 500, damping: 18 }}
                            >
                              <CheckIcon /> Verified
                            </motion.span>
                            <span className="text-xs text-muted">
                              similarity <span className="font-semibold tabular-nums text-ink">{lang.similarity}%</span>
                            </span>
                          </div>
                          <p lang={lang.code} className="script mt-1.5 text-sm text-ink">
                            {lang.feedback}
                          </p>
                          <p className="text-xs text-muted">{lang.feedbackGloss}</p>
                        </motion.div>
                      ) : (
                        <motion.div key="wait" exit={{ opacity: 0 }}>
                          <Skeleton widths={["w-24", "w-2/3"]} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </Row>

                <Row index={3} step={step} title="PayPal Payouts" icon={<SendIcon />} last>
                  <div className="relative flex min-h-9 items-center">
                    <AnimatePresence mode="wait" initial={false}>
                      {step >= 3 ? (
                        <motion.span
                          key="paid"
                          className="pill gap-2 bg-[#ffc439] px-3 py-1 text-[13px] text-ppblue shadow-[0_6px_18px_-8px_rgba(0,48,135,0.45)]"
                          initial={{ opacity: 0, scale: 0.8, y: 6 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ type: "spring", stiffness: 420, damping: 20 }}
                        >
                          <PayPalMark />
                          PayPal Payouts · +$0.25 sent
                        </motion.span>
                      ) : (
                        <motion.span key="wait" className="text-xs text-muted" exit={{ opacity: 0 }}>
                          Waits for a verified clip
                        </motion.span>
                      )}
                    </AnimatePresence>
                    <CoinBurst trigger={reduce ? 0 : s.burst} label="+$0.25" />
                  </div>
                </Row>
              </ol>
            </motion.div>
          </AnimatePresence>

          {/* step indicator */}
          <div className="mt-4 flex items-center justify-between border-t border-line/70 pt-4">
            <div className="flex items-center gap-1.5" role="group" aria-label="Pipeline step">
              {STEPS.map((label, i) => {
                const active = i === step;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => pickStep(i)}
                    aria-label={`Step ${i + 1}: ${label}`}
                    aria-current={active ? "step" : undefined}
                    className="relative grid h-5 w-5 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                  >
                    <span className={`size-1.5 rounded-full ${i < step ? "bg-ok" : "bg-line"}`} />
                    {active && (
                      <motion.span
                        layoutId="hero-demo-step-dot"
                        className="absolute inset-x-0.5 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent"
                        transition={{ type: "spring", stiffness: 500, damping: 36 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-xs font-medium text-muted">
              {step + 1}/4 · {STEPS[step]}
            </p>
          </div>
        </div>
        <figcaption className="mt-3 text-center text-xs text-muted">Illustration of the live flow (example clips, not real data)</figcaption>
      </figure>
    </MotionConfig>
  );
}

function Row({
  index,
  step,
  title,
  icon,
  badge,
  last,
  children,
}: {
  index: number;
  step: number;
  title: string;
  icon: ReactNode;
  badge?: string;
  last?: boolean;
  children: ReactNode;
}) {
  const state = step > index ? "done" : step === index ? "active" : "pending";
  return (
    <li className="relative grid grid-cols-[2rem_1fr] gap-3">
      {!last && (
        <span aria-hidden className="absolute left-4 top-9 bottom-0 w-px -translate-x-1/2 bg-line">
          <motion.span
            className="absolute inset-x-0 top-0 block bg-ok"
            initial={false}
            animate={{ height: state === "done" ? "100%" : "0%" }}
            transition={{ duration: 0.5, ease: EASE }}
          />
        </span>
      )}
      <span
        className={`relative mt-1 grid size-8 place-items-center rounded-full border transition-colors duration-300 ${
          state === "done"
            ? "border-ok/30 bg-ok/10 text-ok"
            : state === "active"
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-line bg-paper text-muted/60"
        }`}
      >
        {state === "done" ? <CheckIcon /> : icon}
      </span>
      <div className={`pb-3 transition-opacity duration-300 ${state === "pending" ? "opacity-55" : ""}`}>
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</p>
          {badge && <span className="rounded-md bg-paper-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">{badge}</span>}
        </div>
        <div className="mt-1">{children}</div>
      </div>
    </li>
  );
}

/** Recording timer driven by a motion value (no per-frame React state). */
function Timer({ seconds, mode }: { seconds: number; mode: "live" | "paused" | "done" }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `0:${v.toFixed(1).padStart(4, "0")}`);
  useEffect(() => {
    if (mode === "done") {
      mv.set(seconds);
      return;
    }
    if (mode === "live") {
      mv.set(0);
      const c = animate(mv, seconds, { duration: seconds, ease: "linear" });
      return () => c.stop();
    }
  }, [mode, seconds, mv]);
  return <motion.span className="tabular-nums">{text}</motion.span>;
}

/** Word-by-word "typing" (words, not characters, so Indic conjuncts never split). */
function TypeWords({ text, lang, caret }: { text: string; lang: string; caret: boolean }) {
  const words = text.split(" ");
  return (
    <motion.p
      lang={lang}
      className="script text-base text-ink"
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.16, delayChildren: 0.1 } } }}
    >
      {words.map((w, i) => (
        <span key={`${w}-${i}`}>
          <motion.span
            className="inline-block"
            variants={{ hidden: { opacity: 0, y: 4, filter: "blur(4px)" }, show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.3 } } }}
          >
            {w}
          </motion.span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
      {caret && (
        <motion.span
          aria-hidden
          className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.15em] bg-accent"
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 0.9, repeat: Infinity }}
        />
      )}
    </motion.p>
  );
}

function Skeleton({ widths }: { widths: string[] }) {
  return (
    <div className="space-y-1.5 pt-1" aria-hidden>
      {widths.map((w, i) => (
        <div key={i} className={`h-2.5 rounded-full bg-paper-2 ${w}`} />
      ))}
    </div>
  );
}

const iconProps = {
  width: 15,
  height: 15,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg {...iconProps} width={13} height={13} strokeWidth={2} className={className}>
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}
function MicIcon() {
  return (
    <svg {...iconProps}>
      <rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" />
      <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2" />
    </svg>
  );
}
function EarIcon() {
  return (
    <svg {...iconProps}>
      <path d="M2 8h1.5M5 5v6M8 3v10M11 5.5v5M14 8h-1" />
    </svg>
  );
}
function ScaleIcon() {
  return (
    <svg {...iconProps}>
      <path d="M8 2v12M4 14h8M3 4h10M3 4l-1.8 4.5a2 2 0 0 0 3.6 0L3 4zM13 4l-1.8 4.5a2 2 0 0 0 3.6 0L13 4z" />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg {...iconProps}>
      <path d="M14.5 1.5L7 9M14.5 1.5l-4.5 13-3-5.5-5.5-3 13-4.5z" />
    </svg>
  );
}
function PayPalMark() {
  return (
    <svg width="12" height="14" viewBox="0 0 24 28" aria-hidden>
      <path fill="#003087" d="M7.3 26.4H2.6a.8.8 0 0 1-.8-.9L5.4 2.3A1.4 1.4 0 0 1 6.8 1h8.3c4.6 0 7.5 2.4 6.7 6.7-.9 5.3-4.4 7.6-9.1 7.6H9.6a1 1 0 0 0-1 .8l-1.3 10.3z" />
      <path fill="#0070e0" d="M20.2 8.4c-.9 5-4.2 7.4-8.7 7.4H9.9a1 1 0 0 0-1 .8l-1.4 9.3-.2 1.2a.7.7 0 0 0 .7.8h3.6a.9.9 0 0 0 .9-.8l.7-4.6a.9.9 0 0 1 .9-.8h.8c4 0 6.8-1.6 7.6-6.3.4-2.3 0-4-1.3-5z" />
    </svg>
  );
}
