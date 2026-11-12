"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { SpeakerSteps } from "@/components/recorder/steps";

const UI_LANGS = ["English", "Hindi", "Tagalog", "Swahili", "Bengali", "Tamil", "Spanish", "Indonesian", "Yoruba", "Urdu"];

export function JoinForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [uiLanguage, setUiLanguage] = useState("English");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <motion.form
      className="card relative mt-8 max-w-2xl overflow-hidden p-6 sm:p-8"
      initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch("/api/contributors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, uiLanguage, consent }),
        });
        const j = await res.json();
        if (!res.ok) {
          setError(j.error);
          setBusy(false);
          return;
        }
        router.refresh();
      }}
    >
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-accent/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-10 size-48 rounded-full bg-[#ffc439]/15 blur-3xl" />

      <div className="relative">
        <SpeakerSteps current={0} />

        <div className="mt-7 border-t border-line pt-6">
          <p className="font-display text-2xl font-semibold">Join as a speaker</p>
          <p className="mt-1 text-sm text-muted">No password needed. We only need to know where to send your PayPal payouts.</p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="label">Name shown to funders</span>
            <input
              className="input transition-shadow focus-visible:ring-4 focus-visible:ring-accent/15"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Asha"
              autoComplete="given-name"
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="label">Language for AI feedback</span>
            <select
              className="input transition-shadow focus-visible:ring-4 focus-visible:ring-accent/15"
              value={uiLanguage}
              onChange={(e) => setUiLanguage(e.target.value)}
            >
              {UI_LANGS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5 sm:col-span-2">
            <span className="label">PayPal email (where you get paid)</span>
            <span className="relative block">
              <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md bg-ppblue text-[11px] font-bold italic text-white">
                P
              </span>
              <input
                className="input pl-11 transition-shadow focus-visible:ring-4 focus-visible:ring-accent/15"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </span>
            <span className="text-xs text-muted">Sandbox demo: use a PayPal sandbox personal account email.</span>
          </label>
        </div>

        <label
          className={`mt-5 flex cursor-pointer gap-3 rounded-2xl border p-4 text-sm transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-accent/15 ${
            consent ? "border-ok/30 bg-ok/[0.06]" : "border-line bg-paper-2/50 hover:bg-paper-2"
          }`}
        >
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="peer sr-only" />
          <span
            aria-hidden
            className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors ${consent ? "border-ok bg-ok text-white" : "border-muted/50 bg-white"}`}
          >
            <AnimatePresence>
              {consent && (
                <motion.svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.4, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 24 }}
                >
                  <path d="M2.5 6.5l2.2 2.2L9.5 3.5" />
                </motion.svg>
              )}
            </AnimatePresence>
          </span>
          <span>
            <span className="block font-semibold text-ink">Consent to use my voice</span>
            <span className="mt-1 block text-muted">
              I consent to my recordings being used to train and evaluate speech AI for this campaign&apos;s stated purpose. My name and email
              are never included in the dataset, only a pseudonym.
            </span>
          </span>
        </label>

        <AnimatePresence>
          {error && (
            <motion.p
              role="alert"
              className="mt-4 text-sm text-bad"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <motion.button
            className="btn btn-primary shimmer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30"
            disabled={busy}
            whileHover={busy ? undefined : { scale: 1.02 }}
            whileTap={busy ? undefined : { scale: 0.97 }}
          >
            {busy ? "Joining…" : "Start recording →"}
          </motion.button>
          <p className="text-xs text-muted">Payouts arrive via PayPal Payouts (sandbox) after AI verifies your clips.</p>
        </div>
      </div>
    </motion.form>
  );
}
