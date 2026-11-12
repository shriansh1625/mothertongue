/**
 * Settlement agent: turns verified clips into PayPal Payouts, and closes campaigns with an
 * automatic PayPal refund of the unused budget.
 *
 * Guardrails (deterministic, always on):
 *  - only clips the judge ACCEPTED and that are still unpaid
 *  - never pay more than the funded budget allows
 *  - velocity hold: a speaker submitting implausibly fast is held for human review
 *  - idempotent: sender_batch_id doubles as PayPal-Request-Id, clips are locked in one transaction
 */
import { db, newId, logEvent, getCampaign, campaignMoney, clipCostCents, usd } from "./db";
import {
  createPayoutBatch,
  getPayoutBatch,
  refundCapture,
  clipStatusFromPayout,
  PayPalError,
  type PayoutItemInput,
} from "./paypal";
import { writeSettlementNote } from "./ai";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VELOCITY_LIMIT = 25; // clips per speaker per 10 minutes

/**
 * A definite rejection means PayPal certainly did not create the batch (e.g. VALIDATION_ERROR,
 * INSUFFICIENT_FUNDS). Network errors, timeouts, 5xx and conflict/rate-limit codes are ambiguous:
 * the batch may exist, so the clips must stay locked.
 */
function isDefiniteRejection(e: unknown): e is PayPalError {
  return e instanceof PayPalError && e.status >= 400 && e.status < 500 && ![408, 409, 429].includes(e.status);
}

function isDuplicateBatchId(e: PayPalError): boolean {
  const issue = (e.issue || "").toUpperCase();
  return issue.includes("DUPLICATE") || issue.includes("ALREADY_USED") || /sender_batch_id.*(already|duplicate)/i.test(e.body);
}

const gRecover = globalThis as unknown as { __mtRecovering?: Set<string> };

/**
 * Resubmit payouts stuck in CREATING (process restarted between the clip lock and PayPal's reply).
 * Uses the SAME payoutId as sender_batch_id / PayPal-Request-Id, so PayPal replays or rejects the
 * duplicate instead of paying twice. Never marks these FAILED blindly.
 */
async function recoverStalePayouts(campaignId: string) {
  const d = db();
  const recovering = (gRecover.__mtRecovering ??= new Set<string>());
  const stale = d
    .prepare(
      "SELECT id FROM payouts WHERE campaign_id = ? AND status = 'CREATING' AND paypal_batch_id IS NULL AND created_at < datetime('now', '-5 minutes')",
    )
    .all(campaignId) as { id: string }[];
  if (!stale.length) return;
  const campaign = getCampaign(campaignId);
  if (!campaign) return;
  for (const { id: payoutId } of stale) {
    if (recovering.has(payoutId)) continue;
    recovering.add(payoutId);
    try {
      const rows = d
        .prepare(
          `SELECT pi.id, pi.amount_cents, pi.clip_ids, c.paypal_email
           FROM payout_items pi JOIN contributors c ON c.id = pi.contributor_id
           WHERE pi.payout_id = ?`,
        )
        .all(payoutId) as { id: string; amount_cents: number; clip_ids: string; paypal_email: string }[];
      if (!rows.length) continue;
      const items: PayoutItemInput[] = rows.map((r) => {
        let n = 1;
        try {
          n = (JSON.parse(r.clip_ids) as string[]).length || 1;
        } catch {}
        return {
          senderItemId: r.id,
          email: r.paypal_email,
          amountCents: r.amount_cents,
          note: `Thank you for recording ${campaign.language_name} for "${campaign.title}". (${n} verified clip${n > 1 ? "s" : ""})`,
        };
      });
      try {
        const batch = await createPayoutBatch(payoutId, items, campaignId);
        d.prepare("UPDATE payouts SET paypal_batch_id = ?, status = ? WHERE id = ? AND status = 'CREATING'").run(
          batch.batch_header.payout_batch_id,
          batch.batch_header.batch_status,
          payoutId,
        );
        logEvent("agent.settle", campaignId, `Recovered stuck payout ${payoutId}: PayPal batch ${batch.batch_header.payout_batch_id}`);
        setTimeout(() => {
          refreshPayout(payoutId).catch(() => {});
        }, 4000);
      } catch (e) {
        if (e instanceof PayPalError && isDuplicateBatchId(e)) {
          // PayPal already has this batch: keep the clips locked and let webhooks / polling update it
          d.prepare("UPDATE payouts SET status = 'UNKNOWN', agent_summary = ? WHERE id = ? AND status = 'CREATING'").run(
            "PayPal already has this batch; waiting for its status.",
            payoutId,
          );
          logEvent("agent.settle", campaignId, `Stuck payout ${payoutId} already exists at PayPal; leaving clips queued`);
        } else if (isDefiniteRejection(e)) {
          d.prepare("UPDATE payouts SET status = 'FAILED', agent_summary = ? WHERE id = ? AND status = 'CREATING'").run(e.message.slice(0, 400), payoutId);
          d.prepare("UPDATE clips SET payout_status = 'unpaid', payout_id = NULL, payout_item_id = NULL WHERE payout_id = ? AND payout_status = 'queued'").run(payoutId);
          logEvent("agent.settle", campaignId, `Stuck payout ${payoutId} rejected by PayPal (${e.issue || e.status}); clips released`);
        } else {
          // ambiguous: leave it CREATING so the next run retries with the same id
          logEvent("agent.settle", campaignId, `Retry of stuck payout ${payoutId} inconclusive: ${(e as Error).message.slice(0, 160)}`);
        }
      }
    } finally {
      recovering.delete(payoutId);
    }
  }
}

type UnpaidRow = { id: string; contributor_id: string; price_cents: number; paypal_email: string; display_name: string };

export type SettlementResult = {
  payoutId: string | null;
  paypalBatchId: string | null;
  speakers: number;
  clips: number;
  totalCents: number;
  held: string[];
  message: string;
};

export async function settleCampaign(campaignId: string, opts: { contributorId?: string; trigger: string }): Promise<SettlementResult> {
  const d = db();
  const campaign = getCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");
  if (!campaign.paypal_capture_id) throw new Error("Campaign is not funded yet");

  try {
    await recoverStalePayouts(campaignId);
  } catch (e) {
    logEvent("agent.settle", campaignId, `Stuck-payout recovery error: ${(e as Error).message.slice(0, 200)}`);
  }

  // ---- lock unpaid accepted clips atomically ----
  d.exec("BEGIN IMMEDIATE");
  let rows: UnpaidRow[] = [];
  const held: string[] = [];
  const payoutId = newId("pob");
  let items: Array<PayoutItemInput & { contributorId: string; clipIds: string[] }> = [];
  try {
    rows = d
      .prepare(
        `SELECT c.id, c.contributor_id, c.price_cents, p.paypal_email, p.display_name
         FROM clips c JOIN contributors p ON p.id = c.contributor_id
         WHERE c.campaign_id = ? AND c.verdict = 'accepted' AND c.payout_status = 'unpaid' ${opts.contributorId ? "AND c.contributor_id = ?" : ""}
         ORDER BY c.created_at`,
      )
      .all(...(opts.contributorId ? [campaignId, opts.contributorId] : [campaignId])) as UnpaidRow[];

    const bySpeaker = new Map<string, { email: string; name: string; cents: number; clipIds: string[] }>();
    for (const r of rows) {
      const s = bySpeaker.get(r.contributor_id) ?? { email: r.paypal_email, name: r.display_name, cents: 0, clipIds: [] };
      s.cents += r.price_cents;
      s.clipIds.push(r.id);
      bySpeaker.set(r.contributor_id, s);
    }

    for (const [contributorId, s] of bySpeaker) {
      const recent = d
        .prepare("SELECT COUNT(*) AS n FROM clips WHERE contributor_id = ? AND created_at >= datetime('now', '-10 minutes')")
        .get(contributorId) as { n: number };
      if (recent.n > VELOCITY_LIMIT || !EMAIL.test(s.email)) {
        held.push(s.name);
        d.prepare(`UPDATE clips SET payout_status = 'held' WHERE id IN (${s.clipIds.map(() => "?").join(",")})`).run(...s.clipIds);
        logEvent("agent.settle", campaignId, `Held ${s.clipIds.length} clip(s) from ${s.name}: ${!EMAIL.test(s.email) ? "invalid PayPal email" : "velocity check"} (needs human review)`);
        continue;
      }
      items.push({
        contributorId,
        clipIds: s.clipIds,
        senderItemId: newId("poi"),
        email: s.email,
        amountCents: s.cents,
        note: "",
      });
    }

    // ---- budget guardrail: paid + this batch must fit the funded amount ----
    const paid = d
      .prepare("SELECT COALESCE(SUM(total_cents),0) AS t FROM payouts WHERE campaign_id = ? AND status NOT IN ('FAILED','DENIED')")
      .get(campaignId) as { t: number };
    const total = items.reduce((s, i) => s + i.amountCents, 0);
    if (paid.t + total > campaign.funded_cents - campaign.refunded_cents) {
      d.exec("ROLLBACK");
      logEvent("agent.settle", campaignId, `Blocked payout of ${usd(total)}: would exceed funded budget`);
      throw new Error("Payout blocked: it would exceed the funded budget.");
    }

    if (items.length === 0) {
      d.exec("COMMIT");
      return { payoutId: null, paypalBatchId: null, speakers: 0, clips: 0, totalCents: 0, held, message: held.length ? `Held ${held.length} speaker(s) for review.` : "Nothing to pay right now." };
    }

    d.prepare("INSERT INTO payouts (id, campaign_id, status, total_cents, item_count) VALUES (?, ?, 'CREATING', ?, ?)").run(
      payoutId,
      campaignId,
      total,
      items.length,
    );
    for (const i of items) {
      d.prepare("INSERT INTO payout_items (id, payout_id, contributor_id, amount_cents, clip_ids) VALUES (?, ?, ?, ?, ?)").run(
        i.senderItemId,
        payoutId,
        i.contributorId,
        i.amountCents,
        JSON.stringify(i.clipIds),
      );
      d.prepare(`UPDATE clips SET payout_status = 'queued', payout_id = ?, payout_item_id = ? WHERE id IN (${i.clipIds.map(() => "?").join(",")})`).run(
        payoutId,
        i.senderItemId,
        ...i.clipIds,
      );
    }
    d.exec("COMMIT");
  } catch (e) {
    try {
      d.exec("ROLLBACK");
    } catch {}
    throw e;
  }

  const clipCount = items.reduce((s, i) => s + i.clipIds.length, 0);
  const totalCents = items.reduce((s, i) => s + i.amountCents, 0);

  // ---- gpt-oss-120b writes the ledger summary + speaker thank-you note ----
  const note = await writeSettlementNote({
    campaignTitle: campaign.title,
    languageName: campaign.language_name,
    speakers: items.length,
    clips: clipCount,
    totalCents,
    held: held.length,
  });
  const speakerNote = note?.speaker_note || `Thank you for recording ${campaign.language_name} for "${campaign.title}".`;
  items = items.map((i) => ({ ...i, note: `${speakerNote} (${i.clipIds.length} verified clip${i.clipIds.length > 1 ? "s" : ""})` }));

  try {
    const batch = await createPayoutBatch(payoutId, items, campaignId);
    d.prepare("UPDATE payouts SET paypal_batch_id = ?, status = ?, agent_summary = ? WHERE id = ?").run(
      batch.batch_header.payout_batch_id,
      batch.batch_header.batch_status,
      note?.summary ?? `Paid ${items.length} speaker(s) ${usd(totalCents)} for ${clipCount} verified clips.`,
      payoutId,
    );
    logEvent(
      "agent.settle",
      campaignId,
      `PayPal Payouts batch ${batch.batch_header.payout_batch_id}: ${usd(totalCents)} to ${items.length} speaker(s) for ${clipCount} clips (${opts.trigger})`,
      { held },
    );
    // pull item-level status right away (sandbox often settles within seconds)
    setTimeout(() => {
      refreshPayout(payoutId).catch(() => {});
    }, 4000);
    return {
      payoutId,
      paypalBatchId: batch.batch_header.payout_batch_id,
      speakers: items.length,
      clips: clipCount,
      totalCents,
      held,
      message: `Sent ${usd(totalCents)} to ${items.length} speaker(s) via PayPal Payouts.`,
    };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 400);
    if (isDefiniteRejection(e)) {
      // PayPal definitely refused the batch: release the clips so a later run can retry
      d.prepare("UPDATE payouts SET status = 'FAILED', agent_summary = ? WHERE id = ?").run(msg, payoutId);
      d.prepare("UPDATE clips SET payout_status = 'unpaid', payout_id = NULL, payout_item_id = NULL WHERE payout_id = ?").run(payoutId);
      logEvent("agent.settle", campaignId, `Payout failed: ${e.issue || e.status}`);
    } else {
      // ambiguous (network/timeout/5xx): the batch may exist at PayPal, so keep the clips queued and
      // keep the amount counted in the budget guard; never re-pay them under a new sender_batch_id
      d.prepare("UPDATE payouts SET status = 'UNKNOWN', agent_summary = ? WHERE id = ?").run(msg, payoutId);
      logEvent("agent.settle", campaignId, `Payout outcome unknown, clips kept queued: ${e instanceof PayPalError ? e.issue || e.status : msg.slice(0, 200)}`);
    }
    throw e;
  }
}

/** Pull batch + item status from PayPal and propagate to clips. */
export async function refreshPayout(payoutId: string) {
  const d = db();
  const p = d.prepare("SELECT * FROM payouts WHERE id = ?").get(payoutId) as { paypal_batch_id: string | null; campaign_id: string } | undefined;
  if (!p?.paypal_batch_id) return;
  const batch = await getPayoutBatch(p.paypal_batch_id, p.campaign_id);
  d.prepare("UPDATE payouts SET status = ? WHERE id = ?").run(batch.batch_header.batch_status, payoutId);
  for (const it of batch.items ?? []) {
    const sid = it.payout_item.sender_item_id;
    if (!sid) continue;
    applyItemStatus(sid, it.payout_item_id, it.transaction_status);
  }
}

export function applyItemStatus(senderItemId: string, paypalItemId: string | undefined, status: string | undefined) {
  const d = db();
  d.prepare("UPDATE payout_items SET status = ?, paypal_item_id = COALESCE(?, paypal_item_id) WHERE id = ?").run(
    status || "PENDING",
    paypalItemId ?? null,
    senderItemId,
  );
  d.prepare("UPDATE clips SET payout_status = ? WHERE payout_item_id = ?").run(clipStatusFromPayout(status), senderItemId);
}

/** Close a campaign: pay what's owed, then refund the unused budget to the funder through PayPal. */
export async function closeCampaign(campaignId: string) {
  const d = db();
  const campaign = getCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status === "closed") throw new Error("Campaign is already closed");
  if (!campaign.paypal_capture_id) {
    d.prepare("UPDATE campaigns SET status = 'closed', closed_at = datetime('now') WHERE id = ? AND status IN ('draft','live')").run(campaignId);
    return { refundedCents: 0, refundId: null as string | null };
  }

  // claim the close before any await. A retry while status is already "closing" resumes the same close
  // (the previous attempt may have died after PayPal accepted the refund).
  if (campaign.status !== "closing") {
    const claim = d.prepare("UPDATE campaigns SET status = 'closing' WHERE id = ? AND status = 'live'").run(campaignId);
    if (Number(claim.changes) === 0) throw new Error("Campaign is already closing or closed");
  }

  let refundable = 0;
  let refundId: string | null = null;
  let refundSent = false;
  try {
    try {
      await settleCampaign(campaignId, { trigger: "campaign close" });
    } catch (e) {
      logEvent("agent.settle", campaignId, `Final settlement skipped: ${(e as Error).message.slice(0, 200)}`);
    }

    // clips in denied/failed batches will never be paid
    d.prepare(
      "UPDATE clips SET payout_status = 'failed' WHERE campaign_id = ? AND payout_status = 'queued' AND payout_id IN (SELECT id FROM payouts WHERE status IN ('DENIED','FAILED'))",
    ).run(campaignId);

    const fresh = getCampaign(campaignId)!;
    refundId = fresh.paypal_refund_id;
    if (fresh.paypal_refund_id) {
      refundable = fresh.refunded_cents;
      refundSent = true;
    } else {
      // same remaining figure the campaign page shows (price + fee, excluding clips that will never be paid)
      refundable = campaignMoney(fresh).remaining;
      if (refundable > 0) {
        refundSent = true;
        const r = await refundCapture(
          fresh.paypal_capture_id!,
          refundable,
          campaignId,
          `Unused budget from MotherTongue campaign "${fresh.title}": you only pay for verified recordings.`,
        );
        refundId = r.id;
        // record before marking closed, so a crash here cannot refund a second time
        d.prepare(
          "UPDATE campaigns SET refunded_cents = refunded_cents + ?, paypal_refund_id = ? WHERE id = ? AND paypal_refund_id IS NULL",
        ).run(refundable, refundId, campaignId);
        logEvent("paypal.refund", campaignId, `Refunded unused budget ${usd(refundable)} to funder (refund ${r.id}, ${r.status})`);
      }
    }
  } catch (e) {
    // leave it "closing" once a refund may exist at PayPal; the next close resumes instead of paying out again
    if (!refundSent) d.prepare("UPDATE campaigns SET status = 'live' WHERE id = ? AND status = 'closing'").run(campaignId);
    throw e;
  }
  d.prepare("UPDATE campaigns SET status = 'closed', closed_at = datetime('now'), paypal_refund_id = COALESCE(?, paypal_refund_id) WHERE id = ?").run(
    refundId,
    campaignId,
  );
  return { refundedCents: refundable, refundId };
}

export function speakerUnpaidCents(campaignId: string, contributorId: string): number {
  const r = db()
    .prepare("SELECT COALESCE(SUM(price_cents),0) AS t FROM clips WHERE campaign_id = ? AND contributor_id = ? AND verdict = 'accepted' AND payout_status = 'unpaid'")
    .get(campaignId, contributorId) as { t: number };
  return r.t;
}

export { clipCostCents };
