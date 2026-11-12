import Link from "next/link";
import { notFound } from "next/navigation";
import { db, getCampaign, getPrompts, campaignMoney, usd, CLIP_COLS, type ClipRow } from "@/lib/db";
import { isOwner } from "@/lib/session";
import { FundButton, PostButton } from "@/components/actions";
import { VerdictBadge, PayoutBadge } from "@/components/badges";
import { PAYPAL_WEB } from "@/lib/paypal";

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

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 space-y-8">
      {sp.funded && <Banner tone="ok">Funded through PayPal. Your campaign is live and speakers can start recording.</Banner>}
      {sp.cancelled && <Banner tone="warn">PayPal checkout was cancelled. Nothing was charged.</Banner>}
      {sp.error && <Banner tone="bad">PayPal reported a problem: {String(sp.error)}</Banner>}

      <div className="grid lg:grid-cols-[1.4fr_0.6fr] gap-6">
        <div className="card p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="pill bg-paper-2 border-line">{campaign.language_name}</span>
            <span
              className={`pill ${campaign.status === "live" ? "bg-ok/10 text-ok" : campaign.status === "closed" ? "bg-paper-2 text-muted" : "bg-warn/10 text-warn"}`}
            >
              {campaign.status === "draft" ? "Awaiting funding" : campaign.status}
            </span>
            <span className="text-sm text-muted">by {campaign.funder_name}</span>
          </div>
          <h1 className="font-display text-4xl font-semibold mt-3">{campaign.title}</h1>
          <p className="text-muted mt-2">{campaign.brief}</p>
          {campaign.ai_rationale && (
            <div className="mt-5 rounded-xl bg-paper-2 p-4 text-sm">
              <p className="label">AI design notes</p>
              <p className="mt-1">{campaign.ai_rationale}</p>
            </div>
          )}
        </div>

        <div className="card p-6 space-y-4">
          <Money label="Budget" value={usd(campaign.budget_cents)} />
          <Money label="Funded via PayPal" value={usd(campaign.funded_cents)} hint={campaign.paypal_capture_id ? `capture ${campaign.paypal_capture_id}` : undefined} />
          <Money label="Committed to verified clips" value={usd(money.committed)} hint={`${money.accepted} clips × ${usd(money.cost)}`} />
          <Money label="Paid to speakers" value={usd(money.paidToSpeakers)} />
          {campaign.refunded_cents > 0 && (
            <Money label="Refunded to funder" value={usd(campaign.refunded_cents)} hint={campaign.paypal_refund_id ? `refund ${campaign.paypal_refund_id}` : undefined} />
          )}
          <Money label="Remaining" value={usd(money.remaining)} hint={`${money.clipsLeft} more clips`} strong />

          {owner && campaign.status === "draft" && <FundButton campaignId={id} label={`Fund ${usd(campaign.budget_cents)}`} />}
          {owner && campaign.status === "live" && (
            <div className="space-y-3 pt-2">
              <PostButton
                url={`/api/campaigns/${id}/settle`}
                label={`Run settlement agent (${unpaid} unpaid)`}
                busyLabel="Paying speakers via PayPal…"
                className="btn btn-primary w-full"
              />
              <PostButton
                url={`/api/campaigns/${id}/close`}
                label="Close campaign & refund unused budget"
                busyLabel="Settling and refunding…"
                confirm="Close this campaign? Speakers are paid for verified clips, then the unused budget is refunded to your PayPal."
                className="btn btn-ghost w-full"
              />
            </div>
          )}
          {!owner && campaign.status === "draft" && <p className="text-sm text-muted">Waiting for the funder to complete PayPal checkout.</p>}
          {campaign.status === "live" && (
            <Link href={`/contribute/${id}`} className="btn btn-accent w-full">
              Record for this campaign →
            </Link>
          )}
          {campaign.status !== "draft" && (
            <a href={`/api/campaigns/${id}/export`} className="btn btn-ghost w-full">
              Download dataset manifest (CSV)
            </a>
          )}
        </div>
      </div>

      <section className="card p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-2xl font-semibold">Recordings</h2>
          <p className="text-sm text-muted">
            {counts.accepted} verified · {counts.review} need review · {counts.rejected} rejected
          </p>
        </div>
        {clips.length === 0 ? (
          <p className="text-muted mt-4">No recordings yet.</p>
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 font-medium">Sentence → what the AI heard</th>
                  <th className="py-2 pr-3 font-medium">Speaker</th>
                  <th className="py-2 pr-3 font-medium">AI verdict</th>
                  <th className="py-2 pr-3 font-medium">Payout</th>
                  <th className="py-2 font-medium">Audio</th>
                </tr>
              </thead>
              <tbody>
                {clips.map((c) => (
                  <tr key={c.id} className="border-b border-line/70 align-top">
                    <td className="py-3 pr-3 max-w-md">
                      <p className="script text-base">{c.prompt_text}</p>
                      <p className="script text-muted">{c.transcript ? `“${c.transcript}”` : "-"}</p>
                      <p className="text-xs text-muted mt-1">
                        {c.explanation_en}
                        {typeof c.match_score === "number" && ` · similarity ${(c.match_score * 100).toFixed(0)}%`}
                        {c.judge && ` · ${c.judge}`}
                      </p>
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap">{c.speaker}</td>
                    <td className="py-3 pr-3">
                      <VerdictBadge verdict={c.verdict} />
                    </td>
                    <td className="py-3 pr-3">
                      {c.verdict === "accepted" ? <PayoutBadge status={c.payout_status} /> : <span className="text-muted">-</span>}
                      {c.verdict === "accepted" && <p className="text-xs text-muted mt-1">{usd(c.price_cents)}</p>}
                    </td>
                    <td className="py-3">
                      <audio controls preload="none" src={`/api/clips/${c.id}/audio`} className="h-9 w-48" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="card p-6">
          <h2 className="font-display text-2xl font-semibold">PayPal payouts</h2>
          {payouts.length === 0 ? (
            <p className="text-muted mt-3">No payouts yet. The settlement agent pays speakers in batches.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {payouts.map((p) => (
                <li key={p.id} className="rounded-xl border border-line p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">
                      {usd(p.total_cents)} → {p.item_count} speaker{p.item_count > 1 ? "s" : ""}
                    </p>
                    <span className="pill bg-paper-2 border-line">{p.status}</span>
                  </div>
                  {p.agent_summary && <p className="text-sm text-muted mt-1">{p.agent_summary}</p>}
                  <p className="text-xs text-muted mt-2 font-mono">
                    batch {p.paypal_batch_id ?? "-"} · {p.created_at} UTC
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card p-6">
          <h2 className="font-display text-2xl font-semibold">Sentences ({prompts.length})</h2>
          <ol className="mt-4 space-y-2 text-sm list-decimal pl-5">
            {prompts.map((p) => (
              <li key={p.id}>
                <span className="script text-base">{p.text}</span>
                <span className="text-muted"> · {p.gloss}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <p className="text-xs text-muted">
        PayPal environment: {PAYPAL_WEB.includes("sandbox") ? "sandbox" : "live"} · order {campaign.paypal_order_id ?? "-"}
      </p>
    </div>
  );
}

function Money({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div>
        <p className="text-sm text-muted">{label}</p>
        {hint && <p className="text-xs text-muted/80 font-mono">{hint}</p>}
      </div>
      <p className={`font-display ${strong ? "text-2xl text-accent" : "text-xl"} font-semibold`}>{value}</p>
    </div>
  );
}

function Banner({ tone, children }: { tone: "ok" | "warn" | "bad"; children: React.ReactNode }) {
  const cls = { ok: "bg-ok/10 text-ok border-ok/20", warn: "bg-warn/10 text-warn border-warn/20", bad: "bg-bad/10 text-bad border-bad/20" }[tone];
  return <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${cls}`}>{children}</div>;
}
