"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { VerdictBadge, PayoutBadge } from "@/components/badges";
import { CoinBurst, WaveBars } from "@/components/motion/primitives";
import { useMicMeter } from "@/components/recorder/use-mic-meter";
import { RecordButton } from "@/components/recorder/record-button";
import { AnimatedMoney } from "@/components/recorder/money";

type P = { id: string; text: string; gloss: string };
type Result = {
  id: string;
  verdict: "accepted" | "rejected" | "review";
  explanation: string | null;
  explanationEn: string | null;
  transcript: string | null;
  matchScore: number | null;
  priceCents: number;
  judge: string | null;
  reasons: string[];
};
type MyClip = {
  id: string;
  prompt_id: string;
  verdict: string;
  price_cents: number;
  payout_status: string;
  paypal_item_id: string | null;
  paypal_batch_id: string | null;
};

const MAX_SECONDS = 15;
const EASE = [0.22, 1, 0.36, 1] as const;
const SPRING = { type: "spring", stiffness: 260, damping: 24 } as const;

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  // buttons/links handle Space natively, so let them
  return !!t.closest("input, textarea, select, button, a, [role='button'], [contenteditable='true']");
}

export function Recorder(props: {
  campaignId: string;
  languageName: string;
  priceCents: number;
  prompts: P[];
  initiallyDone: string[];
  me: { name: string; email: string; uiLanguage: string };
}) {
  const router = useRouter();
  const [done, setDone] = useState<Set<string>>(new Set(props.initiallyDone));
  const firstOpen = props.prompts.findIndex((p) => !props.initiallyDone.includes(p.id));
  const [idx, setIdx] = useState(firstOpen === -1 ? 0 : firstOpen);
  const [dir, setDir] = useState(1);
  const [state, setState] = useState<"idle" | "recording" | "checking" | "result" | "error">("idle");
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<{ clips: MyClip[]; totals: { earned: number; paid: number } } | null>(null);
  const [burst, setBurst] = useState({ n: 0, label: "" });
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const secRef = useRef(0);
  const meter = useMicMeter(32);

  const prompt = props.prompts[idx];
  const allDone = props.prompts.every((p) => done.has(p.id));

  const loadMine = useCallback(async () => {
    const res = await fetch(`/api/me?campaign=${props.campaignId}`, { cache: "no-store" });
    if (res.ok) setMine(await res.json());
  }, [props.campaignId]);

  useEffect(() => {
    const first = setTimeout(loadMine, 0);
    const t = setInterval(loadMine, 4000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [loadMine]);

  // release the microphone if the speaker navigates away mid-recording
  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
      const rec = recRef.current;
      if (rec && rec.state !== "inactive") {
        rec.onstop = null;
        rec.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function goTo(i: number) {
    setDir(i >= idx ? 1 : -1);
    setIdx(i);
  }

  async function start() {
    setError(null);
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        meter.stop();
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        upload(new Blob(chunks.current, { type: rec.mimeType || mime || "audio/webm" }));
      };
      rec.start();
      recRef.current = rec;
      streamRef.current = stream;
      meter.start(stream); // live level meter taps the same stream MediaRecorder records
      secRef.current = 0;
      setSeconds(0);
      setState("recording");
      timer.current = setInterval(() => {
        secRef.current += 1;
        setSeconds(secRef.current);
        if (secRef.current >= MAX_SECONDS) stop();
      }, 1000);
    } catch {
      meter.stop();
      setError("Microphone access was blocked. Allow the microphone in your browser and try again.");
      setState("error");
    }
  }

  function stop() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    meter.stop();
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    setState("checking");
  }

  async function upload(blob: Blob) {
    const fd = new FormData();
    fd.append("campaignId", props.campaignId);
    fd.append("promptId", prompt.id);
    fd.append("audio", blob, "clip.webm");
    try {
      const res = await fetch("/api/clips", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Upload failed");
      setResult(j);
      setState("result");
      if (j.verdict === "accepted") {
        setDone((d) => new Set(d).add(prompt.id));
        setBurst((b) => ({ n: b.n + 1, label: `+$${((j.priceCents ?? props.priceCents) / 100).toFixed(2)}` }));
      }
      loadMine();
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  }

  function next() {
    const order = [...props.prompts.slice(idx + 1), ...props.prompts.slice(0, idx + 1)];
    const n = order.find((p) => !done.has(p.id) && p.id !== prompt.id) ?? order[0];
    goTo(props.prompts.findIndex((p) => p.id === n.id));
    setResult(null);
    setState("idle");
  }

  // Space toggles record / stop (unless focus is in a field or on a control that handles Space itself)
  const toggleRef = useRef<() => void>(() => {});
  useEffect(() => {
    toggleRef.current = () => {
      if (state === "recording") stop();
      else if (state !== "checking" && !(allDone && state !== "result")) start();
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return;
      e.preventDefault();
      toggleRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const clips = mine?.clips ?? [];
  const earned = mine?.totals.earned ?? 0;
  const paid = mine?.totals.paid ?? 0;
  const queued = clips.filter((c) => c.verdict === "accepted" && c.payout_status === "queued").reduce((s, c) => s + c.price_cents, 0);
  const busy = state === "recording" || state === "checking";

  return (
    <MotionConfig reducedMotion="user">
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <section className="card relative p-5 sm:p-8" aria-label="Recording studio">
          {/* header + progress */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
            <span className="font-medium">
              Sentence <span className="tabular-nums text-ink">{idx + 1}</span> of <span className="tabular-nums">{props.prompts.length}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-1.5 rounded-full bg-ok" aria-hidden />
              <span className="tabular-nums text-ink">{done.size}</span> verified · {props.languageName}
            </span>
          </div>
          <div className="mt-3 flex gap-1" role="group" aria-label="Sentences">
            {props.prompts.map((p, i) => {
              const isDone = done.has(p.id);
              const active = i === idx;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-label={`Sentence ${i + 1}${isDone ? ", verified" : ""}`}
                  aria-current={active ? "step" : undefined}
                  disabled={busy}
                  onClick={(e) => {
                    // drop focus after a mouse click so the Space shortcut keeps controlling the recorder
                    if (e.detail > 0) e.currentTarget.blur();
                    if (state === "recording" || state === "checking") return;
                    goTo(i);
                    setResult(null);
                    setState("idle");
                  }}
                  className="group relative flex-1 py-2 outline-none disabled:cursor-not-allowed focus-visible:[&>span:first-child]:ring-2 focus-visible:[&>span:first-child]:ring-ink/40"
                >
                  <span className="relative block h-1.5 overflow-hidden rounded-full bg-line transition-colors group-hover:bg-muted/40">
                    <motion.span
                      className="absolute inset-0 origin-left rounded-full bg-ok"
                      initial={false}
                      animate={{ scaleX: isDone ? 1 : 0 }}
                      transition={{ duration: 0.6, ease: EASE }}
                    />
                  </span>
                  {active && (
                    <motion.span
                      layoutId={`seg-active-${props.campaignId}`}
                      className={`absolute inset-x-0 top-2 h-1.5 rounded-full ${isDone ? "bg-ok ring-2 ring-ok/30" : "bg-ink"}`}
                      transition={SPRING}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {allDone && state !== "result" ? (
            <motion.div
              className="py-16 text-center"
              initial={{ opacity: 0, scale: 0.96, filter: "blur(6px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              transition={SPRING}
            >
              <p className="font-display text-3xl font-semibold">All sentences verified 🎉</p>
              <p className="mt-2 text-muted">Thank you. Your payout is sent to {props.me.email} through PayPal.</p>
            </motion.div>
          ) : (
            <>
              {/* sentence card */}
              <div className="relative mt-6 overflow-hidden rounded-2xl border border-line bg-paper/70 px-5 py-6 sm:px-7 sm:py-8">
                <div aria-hidden className="dot-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent_75%)]" />
                <AnimatePresence mode="popLayout" initial={false} custom={dir}>
                  <motion.div
                    key={prompt.id}
                    custom={dir}
                    className="relative"
                    variants={{
                      enter: (d: number) => ({ opacity: 0, x: 48 * d, filter: "blur(10px)" }),
                      center: { opacity: 1, x: 0, filter: "blur(0px)" },
                      exit: (d: number) => ({ opacity: 0, x: -48 * d, filter: "blur(10px)" }),
                    }}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.45, ease: EASE }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="label">Read this aloud</p>
                      {done.has(prompt.id) && <span className="pill border-ok/20 bg-ok/10 text-ok">Verified</span>}
                    </div>
                    <p className="script mt-3 text-3xl leading-snug sm:text-[2.6rem] sm:leading-[1.3]">
                      {prompt.text}
                    </p>
                    {prompt.gloss && <p className="mt-3 text-muted">{prompt.gloss}</p>}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* record control */}
              <div className="relative mt-8 flex flex-col items-center gap-4">
                <CoinBurst trigger={burst.n} label={burst.label} />
                <RecordButton
                  mode={state === "recording" ? "recording" : state === "checking" ? "checking" : state === "result" ? "retry" : "idle"}
                  seconds={seconds}
                  maxSeconds={MAX_SECONDS}
                  level={meter.level}
                  onStart={start}
                  onStop={stop}
                />
                <div className="flex h-12 w-full max-w-xs items-center justify-center">
                  {state === "recording" ? (
                    <WaveBars levels={meter.levels ?? []} bars={32} className="w-full justify-center" />
                  ) : state === "checking" ? (
                    <WaveBars bars={32} active className="w-full justify-center opacity-50" color="var(--ink)" />
                  ) : (
                    <WaveBars bars={32} active={false} className="w-full justify-center opacity-40" color="var(--muted)" />
                  )}
                </div>
                <p className="min-h-5 text-center text-sm text-muted" aria-live="polite">
                  {state === "recording" && "Recording… press stop when you finish the sentence"}
                  {state === "checking" && <span className="shimmer inline-block rounded-full px-2">Whisper is transcribing, then Qwen3 checks the clip…</span>}
                  {state === "idle" && "Tap record, read the sentence once, and tap stop."}
                </p>
                {(state === "idle" || state === "recording" || state === "result") && (
                  <p className="hidden text-xs text-muted sm:block">
                    Tip: press <kbd className="rounded-md border border-line bg-paper-2 px-1.5 py-0.5 font-mono text-[11px] text-ink">Space</kbd> to{" "}
                    {state === "recording" ? "stop" : "start"} recording
                  </p>
                )}
              </div>
            </>
          )}

          <AnimatePresence>
            {error && (
              <motion.p
                role="alert"
                className="mt-4 text-center text-sm text-bad"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          {/* result */}
          <AnimatePresence mode="wait">
            {result && (
              <motion.div
                key={result.id}
                role="status"
                className={`mt-6 rounded-2xl border p-5 ${
                  result.verdict === "accepted" ? "border-ok/25 bg-ok/[0.06]" : result.verdict === "review" ? "border-warn/25 bg-warn/[0.06]" : "border-bad/20 bg-bad/[0.05]"
                }`}
                initial={{ opacity: 0, y: 24, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.2 } }}
                transition={{ type: "spring", stiffness: 320, damping: 22 }}
              >
                <div className="flex items-center justify-between gap-2">
                  <VerdictBadge verdict={result.verdict} />
                  {result.verdict === "accepted" && (
                    <motion.span
                      className="font-display text-2xl font-semibold text-ok"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 420, damping: 14, delay: 0.1 }}
                    >
                      +${(result.priceCents / 100).toFixed(2)}
                    </motion.span>
                  )}
                </div>
                <p className="script mt-3 text-lg">{result.explanation}</p>
                {result.explanationEn && result.explanationEn !== result.explanation && <p className="mt-1 text-sm text-muted">{result.explanationEn}</p>}
                <div className="mt-3 space-y-0.5 text-xs text-muted">
                  <p className="script">
                    AI heard: <span className="text-ink">“{result.transcript || "…"}”</span>
                  </p>
                  <p>
                    {typeof result.matchScore === "number" && `Similarity ${(result.matchScore * 100).toFixed(0)}% · `}judged by {result.judge}
                    {result.reasons?.length ? ` · ${result.reasons.join(", ")}` : ""}
                  </p>
                </div>
                {typeof result.matchScore === "number" && (
                  <div className="mt-2 h-1 w-full max-w-xs overflow-hidden rounded-full bg-line" aria-hidden>
                    <motion.div
                      className={`h-full rounded-full ${result.verdict === "accepted" ? "bg-ok" : result.verdict === "review" ? "bg-warn" : "bg-bad"}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(0, Math.min(1, result.matchScore)) * 100}%` }}
                      transition={{ duration: 0.9, ease: EASE, delay: 0.15 }}
                    />
                  </div>
                )}
                <div className="mt-4 flex gap-2">
                  {result.verdict === "accepted" ? (
                    <motion.button type="button" onClick={next} className="btn btn-primary" whileHover={{ x: 2 }} whileTap={{ scale: 0.97 }}>
                      Next sentence →
                    </motion.button>
                  ) : (
                    <motion.button type="button" onClick={start} className="btn btn-primary" whileTap={{ scale: 0.97 }}>
                      Try again
                    </motion.button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <aside className="space-y-4">
          <div className="card relative overflow-hidden p-6">
            <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full bg-ok/10 blur-2xl" />
            <p className="label">Your earnings</p>
            <p className="mt-2 font-display text-4xl font-semibold">
              <AnimatedMoney cents={earned} />
            </p>
            <p className="text-sm text-muted">
              <AnimatedMoney cents={paid} className="text-ink" /> already paid to <span className="break-all text-ink">{props.me.email}</span>
            </p>
            {earned > 0 && (
              <div className="mt-4">
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-paper-2" aria-hidden>
                  <motion.div
                    className="absolute inset-y-0 left-0 bg-ok"
                    initial={false}
                    animate={{ width: `${Math.min(1, paid / earned) * 100}%` }}
                    transition={{ duration: 0.8, ease: EASE }}
                  />
                  <motion.div
                    className="absolute inset-y-0 bg-ppblue/70"
                    initial={false}
                    animate={{ left: `${Math.min(1, paid / earned) * 100}%`, width: `${Math.min(1, queued / earned) * 100}%` }}
                    transition={{ duration: 0.8, ease: EASE }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
                  <span className="inline-flex items-center gap-1">
                    <span className="size-2 rounded-full bg-ok" aria-hidden /> Paid
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="size-2 rounded-full bg-ppblue/70" aria-hidden /> Payout sent
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="size-2 rounded-full bg-paper-2 ring-1 ring-line" aria-hidden /> Awaiting payout
                  </span>
                </div>
              </div>
            )}
            <p className="mt-3 text-xs text-muted">
              Verified clips are paid automatically through PayPal Payouts once you reach $1.00, or whenever the funder runs settlement.
            </p>
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between">
              <p className="label">Your recordings</p>
              {clips.length > 0 && <span className="text-xs tabular-nums text-muted">{clips.length}</span>}
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              <AnimatePresence initial={false}>
                {clips.slice(0, 12).map((c) => {
                  const p = props.prompts.find((x) => x.id === c.prompt_id);
                  return (
                    <motion.li
                      key={c.id}
                      layout
                      initial={{ opacity: 0, y: -10, filter: "blur(6px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={SPRING}
                      className="flex items-start justify-between gap-2 border-b border-line/60 pb-2"
                    >
                      <span className="script line-clamp-1 min-w-0">{p?.text ?? "-"}</span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <StatusSwap k={c.verdict}>
                          <VerdictBadge verdict={c.verdict} />
                        </StatusSwap>
                        {c.verdict === "accepted" && (
                          <StatusSwap k={c.payout_status}>
                            <span title={c.paypal_batch_id ? `PayPal batch ${c.paypal_batch_id}` : undefined}>
                              <PayoutBadge status={c.payout_status} />
                            </span>
                          </StatusSwap>
                        )}
                      </span>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
              {!clips.length && <li className="text-muted">Nothing yet. Record your first sentence.</li>}
            </ul>
          </div>

          <p className="text-xs text-muted">
            Speaking as {props.me.name}.{" "}
            <button
              type="button"
              className="rounded underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              onClick={async () => {
                await fetch("/api/contributors", { method: "DELETE" });
                router.refresh();
              }}
            >
              Switch speaker
            </button>
          </p>
        </aside>
      </div>
    </MotionConfig>
  );
}

/** Cross-fades a badge when its status key changes (e.g. "Payout sent" -> "Paid via PayPal"). */
function StatusSwap({ k, children }: { k: string; children: ReactNode }) {
  return (
    <span className="relative inline-flex">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={k}
          className="inline-flex"
          initial={{ opacity: 0, scale: 0.7, filter: "blur(4px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, scale: 0.7, filter: "blur(4px)" }}
          transition={{ type: "spring", stiffness: 420, damping: 22 }}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
