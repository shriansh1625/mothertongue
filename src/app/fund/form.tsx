"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { SpotlightCard } from "@/components/motion/primitives";
import { AnimatedNumber } from "@/components/fund/animated-number";
import { CostCalculator } from "@/components/fund/cost-calculator";
import { DesignLoader } from "@/components/fund/design-loader";
import { ExampleTabs, type FundExample } from "@/components/fund/example-tabs";
import { InlineAlert } from "@/components/fund/inline-alert";

const EXAMPLES: FundExample[] = [
  {
    language: "Hindi (rural UP accent)",
    brief: "Patient phrases for a clinic voice assistant in rural Uttar Pradesh: symptoms, medicine timing, appointments, family members.",
    native: "हि",
    short: "Hindi",
    topic: "clinic",
  },
  {
    language: "Tagalog",
    brief: "Everyday banking and mobile-payment phrases for a voice assistant used by first-time smartphone users in the Philippines.",
    native: "Tl",
    short: "Tagalog",
    topic: "banking",
  },
  {
    language: "Swahili",
    brief: "Farm and weather vocabulary for a voice helpline that gives smallholder farmers planting advice.",
    native: "Sw",
    short: "Swahili",
    topic: "farming",
  },
];

// Own input styling (instead of .input) so focus/hover states can be tuned without touching globals.css.
const INPUT =
  "w-full rounded-xl border border-line bg-[#fffdf9] px-3.5 py-2.5 text-[15px] text-ink placeholder:text-muted/60 outline-none transition-[border-color,box-shadow,background-color] duration-200 hover:border-[#d8cab5] focus:border-accent focus:bg-white focus:shadow-[0_0_0_4px_rgba(194,65,12,0.12)] disabled:opacity-60";

export function CreateCampaignForm({ explainer }: { explainer?: ReactNode }) {
  const router = useRouter();
  const [funderName, setFunderName] = useState("");
  const [language, setLanguage] = useState(EXAMPLES[0].language);
  const [brief, setBrief] = useState(EXAMPLES[0].brief);
  const [count, setCount] = useState(12);
  const [price, setPrice] = useState("0.25");
  const [budget, setBudget] = useState("20.00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const priceCents = Math.round(parseFloat(price || "0") * 100);
  const budgetCents = Math.round(parseFloat(budget || "0") * 100);
  const costPerClip = Math.round(priceCents * 1.1);
  const maxClips = costPerClip > 0 ? Math.floor(budgetCents / costPerClip) : 0;
  // a budget that can't pay for even one clip would create a funded campaign that rejects every recording
  const cantCover = !(Number.isFinite(maxClips) && maxClips >= 1);
  const coverHint = !(priceCents > 0)
    ? "Set a pay per clip to continue."
    : `Budget must cover at least one clip at this price (${Number.isFinite(costPerClip) ? `$${(costPerClip / 100).toFixed(2)}` : "-"} incl. fee).`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || cantCover) return;
    setBusy(true);
    setError(null);
    // Bring the card's top (where the AI loading state lives) into view, e.g. after submitting from the bottom on mobile.
    const card = cardRef.current;
    if (card && card.getBoundingClientRect().top < 64) card.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ funderName, language, brief, count, priceCents, budgetCents }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Something went wrong");
      router.push(`/campaigns/${j.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const safeCost = Number.isFinite(costPerClip) ? costPerClip : 0;
  const safeMax = Number.isFinite(maxClips) ? Math.max(0, maxClips) : 0;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:grid-rows-[auto_1fr] lg:gap-x-12">
      {/* Left (desktop) / first (mobile): steps + promise */}
      <div className="lg:col-start-1 lg:row-start-1">{explainer}</div>

      {/* Right: the form card */}
      <div ref={cardRef} className="scroll-mt-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start lg:[@media(min-height:980px)]:sticky lg:[@media(min-height:980px)]:top-24">
        <SpotlightCard tilt={false} className="glow-ring">
          <form onSubmit={submit} aria-busy={busy} className="space-y-6 p-5 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-semibold">Campaign brief</h2>
                <p className="mt-1 text-sm text-muted">Start from an example or write your own. AI does the prompt design.</p>
              </div>
              <span className="pill border-ppblue/15 bg-ppblue/[0.06] text-ppblue">PayPal sandbox</span>
            </div>

            <ExampleTabs
              examples={EXAMPLES}
              active={language}
              onPick={(ex) => {
                setLanguage(ex.language);
                setBrief(ex.brief);
              }}
            />

            <fieldset disabled={busy} className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Your organisation" help="Shown to speakers on the campaign page.">
                  {(p) => (
                    <input
                      {...p}
                      className={INPUT}
                      value={funderName}
                      onChange={(e) => setFunderName(e.target.value)}
                      placeholder="e.g. Sehat Voice Clinic"
                      maxLength={80}
                      autoComplete="organization"
                      required
                    />
                  )}
                </Field>
                <Field label="Language or dialect" help="Be specific: region or accent helps the AI.">
                  {(p) => <input {...p} className={INPUT} value={language} onChange={(e) => setLanguage(e.target.value)} maxLength={60} required />}
                </Field>
              </div>

              <Field
                label="What is the data for?"
                help="Who will use the voice model and which topics matter."
                aside={
                  <span className={`tabular-nums ${brief.trim().length < 10 ? "text-warn" : "text-muted"}`}>
                    {brief.length}/800
                  </span>
                }
              >
                {(p) => (
                  <textarea
                    {...p}
                    className={`${INPUT} min-h-28 resize-y leading-relaxed`}
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    maxLength={800}
                    required
                  />
                )}
              </Field>

              <div className="grid gap-5 sm:grid-cols-3">
                <Field label="Sentences" help="4 to 30 prompts.">
                  {(p) => (
                    <input {...p} className={INPUT} type="number" inputMode="numeric" min={4} max={30} value={count} onChange={(e) => setCount(Number(e.target.value))} />
                  )}
                </Field>
                <Field label="Pay per clip" help="Goes to the speaker in full.">
                  {(p) => (
                    <Affixed prefix="$" suffix="USD">
                      <input
                        {...p}
                        className={`${INPUT} pl-7 pr-12`}
                        type="number"
                        inputMode="decimal"
                        step="0.05"
                        min="0.05"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                      />
                    </Affixed>
                  )}
                </Field>
                <Field label="Budget" help="$1 to $10,000.">
                  {(p) => (
                    <Affixed prefix="$" suffix="USD">
                      <input
                        {...p}
                        className={`${INPUT} pl-7 pr-12`}
                        type="number"
                        inputMode="decimal"
                        step="1"
                        min="1"
                        max="10000"
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                      />
                    </Affixed>
                  )}
                </Field>
              </div>
            </fieldset>

            <div className="rounded-2xl border border-line bg-paper/70 p-4 text-sm text-muted">
              <p>
                Each verified clip costs{" "}
                <AnimatedNumber value={safeCost / 100} decimals={2} prefix="$" className="font-semibold text-ink" />: the speaker&apos;s pay plus a 10% platform
                fee. This budget covers up to{" "}
                <strong className="text-ink">
                  <AnimatedNumber value={safeMax} /> verified clips
                </strong>
                . Anything unused is refunded via PayPal when you close the campaign.
              </p>
            </div>

            <InlineAlert message={error} onDismiss={() => setError(null)} />

            <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
              {cantCover && !busy ? (
                <p className="text-xs text-warn" role="status">
                  {coverHint}
                </p>
              ) : (
                <p className="text-xs text-muted">No payment yet. You review the prompts before funding.</p>
              )}
              <motion.button
                className="btn btn-primary shimmer group w-full shrink-0 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[#fffdf9] sm:w-auto"
                disabled={busy || cantCover}
                whileHover={busy || cantCover ? undefined : { y: -1 }}
                whileTap={busy || cantCover ? undefined : { scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
                {busy ? (
                  <>
                    <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-paper/30 border-t-paper" />
                    AI is writing your prompts…
                  </>
                ) : (
                  <>
                    Design campaign with AI
                    <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-1">
                      →
                    </span>
                  </>
                )}
              </motion.button>
            </div>
          </form>

          <AnimatePresence>{busy && <DesignLoader language={language} count={count} />}</AnimatePresence>
        </SpotlightCard>
      </div>

      {/* Left (desktop) / last (mobile): live calculator */}
      <div className="lg:col-start-1 lg:row-start-2">
        <CostCalculator priceCents={priceCents} budgetCents={budgetCents} costPerClip={costPerClip} maxClips={maxClips} count={count} />
      </div>
    </div>
  );
}

type FieldProps = { id: string; "aria-describedby": string };

function Field({ label, help, aside, children }: { label: string; help: string; aside?: ReactNode; children: (p: FieldProps) => ReactNode }) {
  const id = useId();
  const helpId = `${id}-help`;
  return (
    <div className="group/field space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="label transition-colors group-focus-within/field:text-accent">
          {label}
        </label>
        {aside && <span className="text-xs">{aside}</span>}
      </div>
      {children({ id, "aria-describedby": helpId })}
      <p id={helpId} className="text-xs text-muted">
        {help}
      </p>
    </div>
  );
}

function Affixed({ prefix, suffix, children }: { prefix: string; suffix: string; children: ReactNode }) {
  return (
    <div className="relative">
      <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-muted">
        {prefix}
      </span>
      {children}
      <span aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold tracking-wide text-muted">
        {suffix}
      </span>
    </div>
  );
}
