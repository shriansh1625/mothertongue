"use client";

import { motion } from "motion/react";
import { AnimatedNumber } from "./animated-number";

const fin = (n: number) => (Number.isFinite(n) ? n : 0);
const SPRING = { type: "spring" as const, stiffness: 140, damping: 22 };

/** Live budget breakdown driven by the form's current values (all numbers derive from the inputs). */
export function CostCalculator({
  priceCents,
  budgetCents,
  costPerClip,
  maxClips,
  count,
}: {
  priceCents: number;
  budgetCents: number;
  costPerClip: number;
  maxClips: number;
  count: number;
}) {
  const price = Math.max(0, fin(priceCents));
  const budget = Math.max(0, fin(budgetCents));
  const cost = Math.max(0, fin(costPerClip));
  const clips = Math.max(0, fin(maxClips));
  const fee = Math.max(0, cost - price);
  const speakerTotal = clips * price;
  const feeTotal = clips * fee;
  const leftover = Math.max(0, budget - clips * cost);
  const pct = (v: number) => (budget > 0 ? Math.min(100, (v / budget) * 100) : 0);
  const sentences = fin(count);
  const takes = sentences > 0 ? clips / sentences : 0;
  const budgetOutOfRange = budget < 100 || budget > 1_000_000;

  return (
    <section aria-labelledby="calc-title" className="card relative overflow-hidden p-6">
      <div aria-hidden className="dot-grid pointer-events-none absolute inset-x-0 top-0 h-28 opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div className="relative flex items-center justify-between gap-3">
        <h2 id="calc-title" className="font-display text-lg font-semibold">
          Live cost calculator
        </h2>
        <span className="pill border-line bg-paper text-muted">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-1.5 rounded-full bg-ok" />
          </span>
          Updates as you type
        </span>
      </div>

      <div className="relative mt-5 flex items-end gap-3">
        <AnimatedNumber value={clips} className="font-display text-5xl font-semibold leading-none text-ink" />
        <div className="pb-1 text-sm leading-tight text-muted">
          verified clips
          <br />
          maximum on this budget
        </div>
      </div>
      <p className="relative mt-2 text-sm text-muted">
        About <AnimatedNumber value={takes} decimals={1} className="font-semibold text-ink" /> recordings of each of your{" "}
        <span className="font-semibold text-ink tabular-nums">{sentences > 0 ? sentences : 0}</span> sentences.
      </p>

      {/* Budget split */}
      <div className="relative mt-5">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-paper-2" role="img" aria-label="How your budget is split between speakers, platform fee and refundable remainder">
          <motion.div className="h-full bg-ok" initial={false} animate={{ width: `${pct(speakerTotal)}%` }} transition={SPRING} />
          <motion.div className="h-full bg-accent" initial={false} animate={{ width: `${pct(feeTotal)}%` }} transition={SPRING} />
          <motion.div
            className="h-full bg-[repeating-linear-gradient(135deg,var(--line)_0_4px,transparent_4px_8px)]"
            initial={false}
            animate={{ width: `${pct(leftover)}%` }}
            transition={SPRING}
          />
        </div>
        <ul className="mt-3 grid grid-cols-1 gap-1.5 text-xs text-muted sm:grid-cols-3">
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-ok" aria-hidden />
            Speakers <AnimatedNumber value={speakerTotal / 100} decimals={2} prefix="$" className="font-semibold text-ink" />
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-accent" aria-hidden />
            Fee <AnimatedNumber value={feeTotal / 100} decimals={2} prefix="$" className="font-semibold text-ink" />
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-full border border-line bg-paper-2" aria-hidden />
            Spare <AnimatedNumber value={leftover / 100} decimals={2} prefix="$" className="font-semibold text-ink" />
          </li>
        </ul>
      </div>

      <dl className="relative mt-5 divide-y divide-line/70 border-t border-line/70 text-sm">
        <Row label="Speaker pay per clip">
          <AnimatedNumber value={price / 100} decimals={2} prefix="$" />
        </Row>
        <Row label="Platform fee (10%)">
          <AnimatedNumber value={fee / 100} decimals={2} prefix="+$" />
        </Row>
        <Row label="You pay per verified clip" strong>
          <AnimatedNumber value={cost / 100} decimals={2} prefix="$" />
        </Row>
        <Row label="You pay per rejected clip">
          <span className="font-semibold text-ok">$0.00</span>
        </Row>
        <Row label="Budget held via PayPal">
          <AnimatedNumber value={budget / 100} decimals={2} prefix="$" />
        </Row>
      </dl>

      <p className={`relative mt-4 rounded-xl px-3 py-2 text-xs ${budgetOutOfRange ? "bg-warn/10 text-warn" : "bg-paper-2/70 text-muted"}`}>
        {budgetOutOfRange
          ? "Budgets must be between $1 and $10,000 in the PayPal sandbox."
          : "Whatever isn't spent on verified clips is refunded to your PayPal when you close the campaign."}
      </p>
    </section>
  );
}

function Row({ label, children, strong = false }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className={strong ? "font-semibold text-ink" : "text-muted"}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-display text-lg font-semibold text-accent" : "font-medium text-ink"}`}>{children}</dd>
    </div>
  );
}
