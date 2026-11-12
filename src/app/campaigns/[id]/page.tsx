import Link from "next/link";
import { notFound } from "next/navigation";
import { db, getCampaign, getPrompts, campaignMoney, usd, CLIP_COLS, type ClipRow } from "@/lib/db";
import { isOwner } from "@/lib/session";
import { AutoRefresh, FundButton, PostButton } from "@/components/actions";
import { PAYPAL_WEB } from "@/lib/paypal";
import { BlurryGradient, CircleScatter } from "@/components/backgrounds";
import { BlurText, NumberTicker, ProgressBar, Reveal } from "@/components/motion/primitives";
import { FlashBanner } from "@/components/campaign/banner";
import { CopyChip } from "@/components/campaign/copy-chip";
import { Recordings, type RecordingItem } from "@/components/campaign/recordings";

export const dynamic = "force-dynamic";

type PayoutRow = {
  id: string;
  paypal_batch_id: string | null;
  status: string;
  total_cents: number;
  item_count: number;
  agent_summary: string | null;
  created_at: string;
};

export default async function CampaignPage(props: PageProps<"/campaigns/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const campaign = getCampaign(id);
  if (!campaign) notFound();
  const owner = await isOwner(campaign);
  const prompts = getPrompts(id);
  const money = campaignMoney(campaign);
  const d = db();
  const clips = d
    .prepare(
      `SELECT ${CLIP_COLS.split(", ").map((c) => `c.${c}`).join(", ")}, p.text AS prompt_text, s.display_name AS speaker
       FROM clips c JOIN prompts p ON p.id = c.prompt_id JOIN contributors s ON s.id = c.contributor_id
       WHERE c.campaign_id = ? ORDER BY c.created_at DESC LIMIT 200`,
    )
    .all(id) as (ClipRow & { prompt_text: string; speaker: string })[];
  const payouts = d.prepare("SELECT * FROM payouts WHERE campaign_id = ? ORDER BY created_at DESC").all(id) as PayoutRow[];
  const unpaid = clips.filter((c) => c.verdict === "accepted" && c.payout_status === "unpaid").length;
  const counts = {
    accepted: clips.filter((c) => c.verdict === "accepted").length,
    rejected: clips.filter((c) => c.verdict === "rejected").length,
    review: clips.filter((c) => c.verdict === "review").length,
  };

  // Only the fields the client list needs (keeps the RSC payload small).
  const recordings: RecordingItem[] = clips.map((c) => ({
    id: c.id,
    prompt_text: c.prompt_text,
    transcript: c.transcript,
    explanation_en: c.explanation_en,
    match_score: c.match_score,
    judge: c.judge,
    verdict: c.verdict,
    payout_status: c.payout_status,
    price_cents: c.price_cents,
    speaker: c.speaker,
    duration_s: c.duration_s,
  }));

  // Money bar: fractions of what was funded (or of the budget before funding).
  const base = campaign.funded_cents > 0 ? campaign.funded_cents : campaign.budget_cents;
  const frac = (v: number) => (base > 0 ? Math.max(0, v) / base : 0);
  const committedUnpaid = Math.max(0, money.committed - money.paidToSpeakers);
  const legend = [
    { label: "Paid to speakers", cents: money.paidToSpeakers, color: "var(--ok)" },
    { label: "Committed, not yet paid (incl. fees)", cents: committedUnpaid, color: "var(--accent)" },
    ...(campaign.refunded_cents > 0 ? [{ label: "Refunded to funder", cents: campaign.refunded_cents, color: "var(--pp-blue)" }] : []),
    { label: "Remaining", cents: money.remaining, color: "rgba(31,27,22,0.18)" },
  ];
  const sandbox = PAYPAL_WEB.includes("sandbox");
  const status = campaign.status;
  // "closing" is transient during closeCampaign and renders like "closed"
  const ended = status === "closed" || status === "closing";
  // keep the funder view current while clips can still arrive or a payout batch is still in flight
  const watch = status === "live" || status === "closing" || payouts.some((p) => payoutTone(p.status).pulse);
  const refundedRaw = sp.refunded === undefined ? null : Number(Array.isArray(sp.refunded) ? sp.refunded[0] : sp.refunded);
  const refunded = refundedRaw !== null && Number.isFinite(refundedRaw) && refundedRaw >= 0 ? refundedRaw : null;
  const aiPrice = campaign.ai_suggested_price_cents ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-5 sm:py-10 lg:space-y-8">
      {watch && <AutoRefresh seconds={6} />}
      {(sp.funded || sp.cancelled || sp.error || refunded !== null) && (
        <div className="space-y-3">
          {refunded !== null && (
            <FlashBanner tone="ok" title="Campaign closed" celebrate={refunded > 0}>
              {refunded > 0 ? `Refunded ${usd(refunded)} to your PayPal.` : "Nothing left to refund."}
            </FlashBanner>
          )}
          {sp.funded && (
            <FlashBanner tone="ok" title="Funded through PayPal" celebrate>
              Your campaign is live and speakers can start recording.
            </FlashBanner>
          )}
          {sp.cancelled && (
            <FlashBanner tone="warn" title="PayPal checkout was cancelled">
              Nothing was charged.
            </FlashBanner>
          )}
          {sp.error && (
            <FlashBanner tone="bad" title="PayPal reported a problem">
              {String(sp.error)}
            </FlashBanner>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]">
        {/* ---------- Header ---------- */}
        <header className="card relative isolate overflow-hidden p-6 sm:p-8">
          <BlurryGradient intensity={0.35} className="-z-10" />
          <CircleScatter seed={Number.parseInt(id.replace(/\D/g, "").slice(0, 6) || "11", 10) || 11} count={22} className="-z-10 opacity-60 [mask-image:linear-gradient(to_left,#000,transparent_65%)]" />

          <div className="flex flex-wrap items-center gap-2">
            <span className="pill border-line bg-white/70 backdrop-blur">
              <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <circle cx="8" cy="8" r="6.2" />
                <path d="M1.8 8h12.4M8 1.8c1.8 1.8 2.6 3.9 2.6 6.2s-.8 4.4-2.6 6.2c-1.8-1.8-2.6-3.9-2.6-6.2S6.2 3.6 8 1.8z" />
              </svg>
              {campaign.language_name}
            </span>
            <StatusPill status={status} />
            <span className="text-sm text-muted">by {campaign.funder_name}</span>
          </div>

          <h1 className="mt-4 font-display text-3xl font-semibold leading-[1.1] text-balance sm:text-4xl lg:text-[2.75rem]">
            <BlurText text={campaign.title} />
          </h1>
          <Reveal delay={0.15} y={10}>
            <p className="mt-3 max-w-2xl text-pretty text-muted sm:text-lg">{campaign.brief}</p>
          </Reveal>

          <Reveal delay={0.25} y={10}>
            <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
              <Stat label="Speaker earns" sub="per verified clip">
                <NumberTicker value={campaign.price_cents / 100} decimals={2} prefix="$" />
              </Stat>
              <Stat label="Cost to you" sub={`per clip · ${(campaign.fee_bps / 100).toFixed(0)}% fee`}>
                <NumberTicker value={money.cost / 100} decimals={2} prefix="$" />
              </Stat>
              <Stat label="Sentences" sub="AI-designed prompts">
                <NumberTicker value={prompts.length} />
              </Stat>
              <Stat label="Verified clips" sub={ended ? "campaign closed" : `${money.clipsLeft} more fundable`}>
                <NumberTicker value={money.accepted} />
              </Stat>
            </dl>
          </Reveal>

          {campaign.ai_rationale && (
            <Reveal delay={0.35} y={10}>
              <aside className="relative mt-6 overflow-hidden rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/[0.07] via-white/60 to-amber-100/40 p-4 sm:p-5">
                <span aria-hidden className="absolute inset-y-4 left-0 w-[3px] rounded-r-full bg-accent/70" />
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent-ink">
                  <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden>
                    <path d="M8 .8l1.5 4.3 4.3 1.5-4.3 1.5L8 12.4 6.5 8.1 2.2 6.6l4.3-1.5L8 .8zM13 10.5l.7 1.8 1.8.7-1.8.7L13 15.5l-.7-1.8-1.8-.7 1.8-.7.7-1.8z" />
                  </svg>
                  AI design notes · gpt-oss-120b
                </p>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink/85">{campaign.ai_rationale}</p>
                {typeof aiPrice === "number" && aiPrice > 0 && (
                  <p className="mt-2 text-xs font-medium text-accent-ink">
                    AI suggested {usd(aiPrice)} per clip · you set {usd(campaign.price_cents)}
                  </p>
                )}
              </aside>
            </Reveal>
          )}
        </header>

        {/* ---------- Money ---------- */}
        <aside className="card flex flex-col p-6" aria-labelledby="money-heading">
          <div className="flex items-center justify-between gap-2">
            <h2 id="money-heading" className="label">
              Budget
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ppblue/[0.07] px-2 py-0.5 text-[11px] font-semibold text-ppblue">
              <span className="font-bold italic">PayPal</span>
              {sandbox ? "sandbox" : "live"}
            </span>
          </div>

          <div className="mt-3">
            <p className="text-sm text-muted">Remaining</p>
            <p className="font-display text-5xl font-semibold leading-none text-accent">
              <NumberTicker value={money.remaining / 100} decimals={2} prefix="$" />
            </p>
            <p className="mt-1.5 text-sm text-muted">
              {status === "closing"
                ? "Closing · settling speakers and refunding unused budget"
                : status === "closed"
                ? "Campaign closed · no new clips accepted"
                : status === "draft" && money.cost > 0
                  ? `Up to ${Math.floor(campaign.budget_cents / money.cost)} clips at ${usd(money.cost)} each once funded`
                  : `${money.clipsLeft} more clips at ${usd(money.cost)} each`}
            </p>
          </div>

          <div className="mt-5">
            <ProgressBar segments={legend.map((l) => ({ value: frac(l.cents), color: l.color, label: `${l.label}: ${usd(l.cents)}` }))} className="h-3" />
            <ul className="mt-3 grid gap-1.5 text-xs">
              {legend.map((l) => (
                <li key={l.label} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-muted">
                    <span aria-hidden className="size-2.5 shrink-0 rounded-[4px]" style={{ background: l.color }} />
                    <span className="truncate">{l.label}</span>
                  </span>
                  <span className="font-mono tabular-nums text-ink/80">{usd(l.cents)}</span>
                </li>
              ))}
            </ul>
            {campaign.funded_cents === 0 && <p className="mt-2 text-xs text-muted">Not funded yet. The bar fills once PayPal checkout completes.</p>}
          </div>

          <div className="mt-5 space-y-3 border-t border-line pt-5">
            <MoneyRow label="Budget" cents={campaign.budget_cents} />
            <MoneyRow label="Funded via PayPal" cents={campaign.funded_cents}>
              {campaign.paypal_capture_id && <CopyChip label="capture" value={campaign.paypal_capture_id} />}
            </MoneyRow>
            <MoneyRow label="Committed to verified clips" cents={money.committed} hint={`${money.payable} ${money.payable === 1 ? "clip" : "clips"} × ${usd(money.cost)}`} />
            <MoneyRow label="Paid to speakers" cents={money.paidToSpeakers} tone="ok" />
            {campaign.refunded_cents > 0 && (
              <MoneyRow label="Refunded to funder" cents={campaign.refunded_cents} tone="ppblue">
                {campaign.paypal_refund_id && <CopyChip label="refund" value={campaign.paypal_refund_id} />}
              </MoneyRow>
            )}
          </div>

          <div className="mt-6 space-y-3">
            {owner && status === "draft" && (
              <div className="space-y-2">
                <FundButton campaignId={id} label={`Fund ${usd(campaign.budget_cents)}`} />
                <p className="flex items-start gap-1.5 text-xs text-muted">
                  <LockIcon />
                  Approve on PayPal{sandbox ? " (sandbox)" : ""}. Speakers are paid only for AI-verified clips; unused budget is refunded when you close.
                </p>
                {sandbox && (
                  <div className="rounded-xl border border-ppblue/20 bg-ppblue/5 px-3 py-2.5 text-xs text-ink">
                    <p className="font-semibold text-ppblue">Sandbox checkout: no real money</p>
                    <p className="mt-1 text-muted">
                      Real PayPal accounts and real cards don&apos;t work here. Log in with a PayPal <strong className="text-ink">sandbox</strong> buyer account.
                    </p>
                    {process.env.DEMO_BUYER_EMAIL ? (
                      <a
                        href={`/api/demo-credentials?campaign=${encodeURIComponent(id)}`}
                        className="btn btn-ghost mt-2.5 px-3 py-1.5 text-xs"
                      >
                        Click to download
                      </a>
                    ) : (
                      <p className="mt-1 text-muted">The sandbox buyer login is in the README.</p>
                    )}
                  </div>
                )}
              </div>
            )}
            {owner && (status === "live" || status === "closing") && (
              <div className="space-y-2.5 rounded-2xl border border-line bg-paper-2/50 p-3">
                <p className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">Funder controls</p>
                <PostButton
                  url={`/api/campaigns/${id}/settle`}
                  label={`Run settlement agent (${unpaid} unpaid)`}
                  busyLabel="Paying speakers via PayPal…"
                  className="btn btn-primary w-full shadow-[0_10px_24px_-14px_rgba(31,27,22,0.8)]"
                  icon={
                    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M14 2L7 9M14 2l-4.5 12-2.5-5-5-2.5L14 2z" />
                    </svg>
                  }
                />
                <PostButton
                  url={`/api/campaigns/${id}/close`}
                  label={status === "closing" ? "Finish closing & refund" : "Close campaign & refund unused budget"}
                  busyLabel="Settling and refunding…"
                  confirm="Close this campaign? Speakers are paid for verified clips, then the unused budget is refunded to your PayPal."
                  redirectTo={`/campaigns/${id}?refunded={refundedCents}`}
                  className="btn btn-ghost w-full text-sm"
                  icon={<LockIcon />}
                />
              </div>
            )}
            {!owner && status === "draft" && (
              <p className="flex items-center gap-2 rounded-xl bg-warn/[0.07] px-3 py-2.5 text-sm text-warn">
                <span aria-hidden className="size-1.5 rounded-full bg-current motion-safe:animate-pulse" />
                Waiting for the funder to complete PayPal checkout.
              </p>
            )}
            {status === "live" && (
              <Link
                href={`/contribute/${id}`}
                className="btn btn-accent group w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
              >
                Record for this campaign
                <span aria-hidden className="transition-transform group-hover:translate-x-1">
                  →
                </span>
              </Link>
            )}
            {status !== "draft" && (
              <a
                href={`/api/campaigns/${id}/export`}
                className="btn btn-ghost w-full text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M8 2v8M4.5 6.8L8 10.3l3.5-3.5M2.5 13.5h11" />
                </svg>
                Download dataset manifest (CSV)
              </a>
            )}
          </div>
        </aside>
      </div>

      {/* ---------- Recordings ---------- */}
      <section className="card p-5 sm:p-6 lg:p-8" aria-labelledby="rec-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="label">Verified by AI · Whisper + judge</p>
            <h2 id="rec-heading" className="mt-1 font-display text-2xl font-semibold sm:text-3xl">
              Recordings
            </h2>
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full bg-ok" />
              {counts.accepted} verified
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full bg-warn" />
              {counts.review} need review
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full bg-bad" />
              {counts.rejected} rejected
            </span>
          </p>
        </div>
        {clips.length === 0 ? (
          <div className="mt-5 flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-10 text-center">
            <span aria-hidden className="grid size-12 place-items-center rounded-full bg-paper-2 text-muted">
              <svg viewBox="0 0 16 16" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <rect x="5.5" y="1.8" width="5" height="8" rx="2.5" />
                <path d="M3.2 7.5a4.8 4.8 0 009.6 0M8 12.3v2" />
              </svg>
            </span>
            <p className="mt-3 font-medium">No recordings yet.</p>
            <p className="mt-1 text-sm text-muted">Clips appear here as speakers record, with the AI verdict for each.</p>
          </div>
        ) : (
          <Recordings clips={recordings} />
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---------- Payouts timeline ---------- */}
        <section className="card p-5 sm:p-6" aria-labelledby="payouts-heading">
          <p className="label">Settlement agent · PayPal Payouts</p>
          <h2 id="payouts-heading" className="mt-1 font-display text-2xl font-semibold">
            PayPal payouts
          </h2>
          {payouts.length === 0 ? (
            <p className="mt-3 text-muted">No payouts yet. The settlement agent pays speakers in batches.</p>
          ) : (
            <ol className="relative mt-5 space-y-5 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-line">
              {payouts.map((p, i) => {
                const tone = payoutTone(p.status);
                return (
                  <li key={p.id} className="relative pl-8">
                    <span aria-hidden className="absolute left-0 top-1.5 flex size-[15px] items-center justify-center rounded-full border-2 border-[#fffdf9] bg-[#fffdf9]">
                      {tone.pulse && <span className="absolute inline-flex size-full rounded-full opacity-50 motion-safe:animate-ping" style={{ background: tone.color }} />}
                      <span className="relative size-[11px] rounded-full" style={{ background: tone.color }} />
                    </span>
                    <Reveal delay={Math.min(i, 6) * 0.06} y={10}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-display text-xl font-semibold tabular-nums">
                          {usd(p.total_cents)}
                          <span className="ml-2 font-sans text-sm font-normal text-muted">
                            → {p.item_count} speaker{p.item_count > 1 ? "s" : ""}
                          </span>
                        </p>
                        <span className="pill" style={{ color: tone.color, background: `color-mix(in srgb, ${tone.color} 10%, transparent)`, borderColor: `color-mix(in srgb, ${tone.color} 22%, transparent)` }}>
                          {p.status}
                        </span>
                      </div>
                      {p.agent_summary && (
                        <div className="mt-2 rounded-xl border border-line bg-paper-2/50 px-3 py-2.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Agent summary</p>
                          <p className="mt-0.5 text-sm text-ink/80">{p.agent_summary}</p>
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                        {p.paypal_batch_id ? <CopyChip label="batch" value={p.paypal_batch_id} /> : <span className="font-mono">batch -</span>}
                        <time className="font-mono" dateTime={p.created_at.replace(" ", "T") + "Z"}>
                          {p.created_at} UTC
                        </time>
                      </div>
                    </Reveal>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* ---------- Sentences ---------- */}
        <section className="card p-5 sm:p-6" aria-labelledby="sentences-heading">
          <p className="label">Designed by AI · native script</p>
          <h2 id="sentences-heading" className="mt-1 font-display text-2xl font-semibold">
            Sentences <span className="text-muted">({prompts.length})</span>
          </h2>
          <ol className="mt-5 space-y-2">
            {prompts.map((p, i) => (
              <li
                key={p.id}
                className="rise flex items-start gap-3 rounded-xl border border-line/80 bg-white/50 px-3 py-2.5 transition-colors hover:border-ink/15 hover:bg-white"
                style={{ animationDelay: `${Math.min(i, 20) * 35}ms` }}
              >
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-ink font-mono text-[11px] font-semibold text-paper tabular-nums">{i + 1}</span>
                <span className="min-w-0">
                  <span className="script block text-base leading-snug">{p.text}</span>
                  {p.gloss && <span className="mt-0.5 block text-sm text-muted">{p.gloss}</span>}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <footer className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>PayPal environment: {sandbox ? "sandbox" : "live"}</span>
        <span aria-hidden>·</span>
        {campaign.paypal_order_id ? <CopyChip label="order" value={campaign.paypal_order_id} /> : <span className="font-mono">order -</span>}
      </footer>
    </div>
  );
}

function StatusPill({ status }: { status: "draft" | "live" | "closing" | "closed" }) {
  if (status === "live") {
    return (
      <span className="pill border-ok/20 bg-ok/10 text-ok">
        <span aria-hidden className="relative flex size-2">
          <span className="absolute inline-flex size-full rounded-full bg-ok opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex size-2 rounded-full bg-ok" />
        </span>
        live
      </span>
    );
  }
  if (status === "closing") {
    return (
      <span className="pill border-line bg-paper-2 text-muted">
        <LockIcon />
        Closing…
      </span>
    );
  }
  if (status === "closed") {
    return (
      <span className="pill border-line bg-paper-2 text-muted">
        <LockIcon />
        closed
      </span>
    );
  }
  return (
    <span className="pill border-warn/20 bg-warn/10 text-warn">
      <span aria-hidden className="size-2 rounded-full border-2 border-current" />
      Awaiting funding
    </span>
  );
}

function Stat({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/75 px-4 py-3 backdrop-blur-sm">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-semibold leading-none">{children}</dd>
      <dd className="mt-1 truncate text-[11px] text-muted">{sub}</dd>
    </div>
  );
}

function MoneyRow({ label, cents, hint, tone, children }: { label: string; cents: number; hint?: string; tone?: "ok" | "ppblue"; children?: React.ReactNode }) {
  const color = tone === "ok" ? "text-ok" : tone === "ppblue" ? "text-ppblue" : "text-ink";
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        {hint && <p className="font-mono text-xs text-muted/80">{hint}</p>}
        {children && <div className="mt-1">{children}</div>}
      </div>
      <p className={`shrink-0 font-display text-xl font-semibold ${color}`}>
        <NumberTicker value={cents / 100} decimals={2} prefix="$" />
      </p>
    </div>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="mt-px size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <rect x="3" y="7" width="10" height="7" rx="1.8" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
    </svg>
  );
}

function payoutTone(status: string): { color: string; pulse: boolean } {
  const s = status.toUpperCase();
  if (["SUCCESS", "COMPLETED", "PAID"].some((k) => s.includes(k))) return { color: "var(--ok)", pulse: false };
  if (["FAIL", "DENIED", "CANCEL", "RETURNED", "BLOCKED", "REFUSED"].some((k) => s.includes(k))) return { color: "var(--bad)", pulse: false };
  if (["UNCLAIMED", "HELD", "ONHOLD", "UNKNOWN"].some((k) => s.includes(k))) return { color: "var(--warn)", pulse: false };
  return { color: "var(--pp-blue)", pulse: true };
}
