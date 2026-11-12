"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`size-4 animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Message({ ok, text }: { ok: boolean; text: string }) {
  return (
    <motion.p
      role={ok ? "status" : "alert"}
      initial={{ opacity: 0, y: -6, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, y: -4, height: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className={`flex items-start gap-2 overflow-hidden text-sm ${ok ? "text-ok" : "text-bad"}`}
    >
      <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full ${ok ? "bg-ok/15" : "bg-bad/15"}`} aria-hidden>
        {ok ? (
          <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <motion.path d="M3.5 8.5l3 3 6-7" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, delay: 0.1 }} />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M8 4v5M8 11.8v.2" />
          </svg>
        )}
      </span>
      <span>{text}</span>
    </motion.p>
  );
}

/** Swaps idle/busy content with a short blur-slide. */
function Swap({ busy, idle, working }: { busy: boolean; idle: ReactNode; working: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={busy ? "busy" : "idle"}
        className="inline-flex items-center justify-center gap-2"
        initial={reduce ? false : { opacity: 0, y: 6, filter: "blur(4px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={reduce ? undefined : { opacity: 0, y: -6, filter: "blur(4px)" }}
        transition={{ duration: 0.2, ease: EASE }}
      >
        {busy ? working : idle}
      </motion.span>
    </AnimatePresence>
  );
}

export function FundButton({ campaignId, label }: { campaignId: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <motion.button
        type="button"
        whileHover={busy ? undefined : { y: -1 }}
        whileTap={busy ? undefined : { scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className={`btn btn-paypal w-full text-base shadow-[0_10px_30px_-12px_rgba(255,196,57,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ppblue focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${busy ? "" : "shimmer"}`}
        disabled={busy}
        aria-busy={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch(`/api/campaigns/${campaignId}/fund`, { method: "POST" });
          const j = await res.json();
          if (!res.ok) {
            setError(j.error || "Could not start PayPal checkout");
            setBusy(false);
            return;
          }
          window.location.href = j.approveUrl;
        }}
      >
        <Swap
          busy={busy}
          working={
            <>
              <Spinner className="text-ppblue" />
              <span className="text-ppblue">Opening PayPal…</span>
            </>
          }
          idle={
            <>
              <span aria-label="PayPal" className="inline-flex text-[1.05rem] tracking-tight">
                <span className="font-bold italic text-ppblue">Pay</span>
                <span className="font-bold italic text-[#009cde]">Pal</span>
              </span>
              <span className="text-[#111]/40" aria-hidden>
                ·
              </span>
              <span>{label}</span>
            </>
          }
        />
      </motion.button>
      <AnimatePresence>{error && <Message key="err" ok={false} text={error} />}</AnimatePresence>
    </div>
  );
}

export function PostButton({
  url,
  label,
  busyLabel,
  confirm: confirmText,
  className = "btn btn-ghost",
  icon,
}: {
  url: string;
  label: string;
  busyLabel: string;
  confirm?: string;
  className?: string;
  /** Optional leading icon (visual only). */
  icon?: ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; n: number } | null>(null);
  return (
    <div className="space-y-1.5">
      <motion.button
        type="button"
        whileTap={busy ? undefined : { scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className={`${className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-paper`}
        disabled={busy}
        aria-busy={busy}
        onClick={async () => {
          if (confirmText && !window.confirm(confirmText)) return;
          setBusy(true);
          setMsg(null);
          try {
            const res = await fetch(url, { method: "POST" });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(j.error || "Request failed");
            setMsg({ ok: true, n: Date.now(), text: j.message || (j.refundedCents !== undefined ? `Refunded $${(j.refundedCents / 100).toFixed(2)} via PayPal.` : "Done.") });
            router.refresh();
          } catch (e) {
            setMsg({ ok: false, n: Date.now(), text: (e as Error).message });
          } finally {
            setBusy(false);
          }
        }}
      >
        <Swap
          busy={busy}
          working={
            <>
              <Spinner />
              <span>{busyLabel}</span>
            </>
          }
          idle={
            <>
              {icon}
              <span>{label}</span>
            </>
          }
        />
      </motion.button>
      <AnimatePresence>{msg && <Message key={msg.n} ok={msg.ok} text={msg.text} />}</AnimatePresence>
    </div>
  );
}

export function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
