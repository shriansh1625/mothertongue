"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VerdictBadge, PayoutBadge } from "@/components/badges";

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

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
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
  const [state, setState] = useState<"idle" | "recording" | "checking" | "result" | "error">("idle");
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<{ clips: MyClip[]; totals: { earned: number; paid: number } } | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const prompt = props.prompts[idx];
  const allDone = props.prompts.every((p) => done.has(p.id));

  const loadMine = useCallback(async () => {
    const res = await fetch(`/api/me?campaign=${props.campaignId}`, { cache: "no-store" });
    if (res.ok) setMine(await res.json());
  }, [props.campaignId]);

  useEffect(() => {
    loadMine();
    const t = setInterval(loadMine, 4000);
    return () => clearInterval(t);
  }, [loadMine]);

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
        stream.getTracks().forEach((t) => t.stop());
        upload(new Blob(chunks.current, { type: rec.mimeType || mime || "audio/webm" }));
      };
      rec.start();
      recRef.current = rec;
      setSeconds(0);
      setState("recording");
      timer.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) stop();
          return s + 1;
        });
      }, 1000);
    } catch {
      setError("Microphone access was blocked. Allow the microphone in your browser and try again.");
      setState("error");
    }
  }

  function stop() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
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
      if (j.verdict === "accepted") setDone((d) => new Set(d).add(prompt.id));
      loadMine();
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  }

  function next() {
    const order = [...props.prompts.slice(idx + 1), ...props.prompts.slice(0, idx + 1)];
    const n = order.find((p) => !done.has(p.id) && p.id !== prompt.id) ?? order[0];
    setIdx(props.prompts.findIndex((p) => p.id === n.id));
    setResult(null);
    setState("idle");
  }

  return (
    <div className="grid lg:grid-cols-[1.3fr_0.7fr] gap-6 mt-8">
      <div className="card p-6 sm:p-8">
        <div className="flex items-center justify-between text-sm text-muted">
          <span>
            Sentence {idx + 1} of {props.prompts.length}
          </span>
          <span>
            {done.size} verified · {props.languageName}
          </span>
        </div>
        <div className="flex gap-1 mt-3">
          {props.prompts.map((p, i) => (
            <button
              key={p.id}
              aria-label={`Sentence ${i + 1}`}
              onClick={() => {
                if (state === "recording" || state === "checking") return;
                setIdx(i);
                setResult(null);
                setState("idle");
              }}
              className={`h-1.5 flex-1 rounded-full ${done.has(p.id) ? "bg-ok" : i === idx ? "bg-ink" : "bg-line"}`}
            />
          ))}
        </div>

        {allDone && state !== "result" ? (
          <div className="py-16 text-center">
            <p className="font-display text-3xl font-semibold">All sentences verified 🎉</p>
            <p className="text-muted mt-2">Thank you. Your payout is sent to {props.me.email} through PayPal.</p>
          </div>
        ) : (
          <>
            <p className="label mt-8">Read this aloud</p>
            <p className="script text-3xl sm:text-4xl mt-3 leading-snug">{prompt.text}</p>
            <p className="text-muted mt-3">{prompt.gloss}</p>

            <div className="mt-10 flex flex-col items-center gap-4">
              {state === "recording" ? (
                <button onClick={stop} className="recording size-24 rounded-full bg-accent text-white font-semibold">
                  Stop
                  <br />
                  <span className="text-sm font-mono">{seconds}s</span>
                </button>
              ) : state === "checking" ? (
                <div className="size-24 rounded-full border-4 border-line border-t-ink animate-spin" aria-label="Checking" />
              ) : (
                <button onClick={start} className="size-24 rounded-full bg-ink text-paper font-semibold hover:bg-black">
                  {state === "result" ? "Retry" : "Record"}
                </button>
              )}
              <p className="text-sm text-muted h-5">
                {state === "recording" && "Recording… press stop when you finish the sentence"}
                {state === "checking" && "Whisper is transcribing, then Qwen3 checks the clip…"}
                {state === "idle" && "Tap record, read the sentence once, and tap stop."}
              </p>
            </div>
          </>
        )}

        {error && <p className="text-bad text-sm text-center mt-4">{error}</p>}

        {result && (
          <div className="rise mt-6 rounded-2xl border border-line bg-paper-2/60 p-5">
            <div className="flex items-center justify-between gap-2">
              <VerdictBadge verdict={result.verdict} />
              {result.verdict === "accepted" && <span className="font-display text-2xl font-semibold text-ok">+${(result.priceCents / 100).toFixed(2)}</span>}
            </div>
            <p className="mt-3 text-lg script">{result.explanation}</p>
            {result.explanationEn && result.explanationEn !== result.explanation && <p className="text-sm text-muted mt-1">{result.explanationEn}</p>}
            <div className="mt-3 text-xs text-muted space-y-0.5">
              <p className="script">
                AI heard: <span className="text-ink">“{result.transcript || "…"}”</span>
              </p>
              <p>
                {typeof result.matchScore === "number" && `Similarity ${(result.matchScore * 100).toFixed(0)}% · `}judged by {result.judge}
                {result.reasons?.length ? ` · ${result.reasons.join(", ")}` : ""}
              </p>
            </div>
            <div className="mt-4 flex gap-2">
              {result.verdict === "accepted" ? (
                <button onClick={next} className="btn btn-primary">
                  Next sentence →
                </button>
              ) : (
                <button onClick={start} className="btn btn-primary">
                  Try again
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <div className="card p-6">
          <p className="label">Your earnings</p>
          <p className="font-display text-4xl font-semibold mt-2">${((mine?.totals.earned ?? 0) / 100).toFixed(2)}</p>
          <p className="text-sm text-muted">
            ${((mine?.totals.paid ?? 0) / 100).toFixed(2)} already paid to <span className="text-ink">{props.me.email}</span>
          </p>
          <p className="text-xs text-muted mt-3">
            Verified clips are paid automatically through PayPal Payouts once you reach $1.00, or whenever the funder runs settlement.
          </p>
        </div>
        <div className="card p-6">
          <p className="label">Your recordings</p>
          <ul className="mt-3 space-y-2 text-sm">
            {(mine?.clips ?? []).slice(0, 12).map((c) => {
              const p = props.prompts.find((x) => x.id === c.prompt_id);
              return (
                <li key={c.id} className="flex items-start justify-between gap-2 border-b border-line/60 pb-2">
                  <span className="script line-clamp-1">{p?.text ?? "-"}</span>
                  <span className="flex flex-col items-end gap-1">
                    <VerdictBadge verdict={c.verdict} />
                    {c.verdict === "accepted" && <PayoutBadge status={c.payout_status} />}
                  </span>
                </li>
              );
            })}
            {!mine?.clips?.length && <li className="text-muted">Nothing yet. Record your first sentence.</li>}
          </ul>
        </div>
        <p className="text-xs text-muted">
          Speaking as {props.me.name}.{" "}
          <button
            className="underline"
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
  );
}
