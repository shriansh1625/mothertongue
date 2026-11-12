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
    // release the clips so a later run can retry
    d.prepare("UPDATE payouts SET status = 'FAILED', agent_summary = ? WHERE id = ?").run((e as Error).message.slice(0, 400), payoutId);
    d.prepare("UPDATE clips SET payout_status = 'unpaid', payout_id = NULL, payout_item_id = NULL WHERE payout_id = ?").run(payoutId);
    logEvent("agent.settle", campaignId, `Payout failed: ${e instanceof PayPalError ? e.issue || e.status : (e as Error).message}`);
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
  const campaign = getCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status === "closed") throw new Error("Campaign is already closed");
  if (!campaign.paypal_capture_id) {
    db().prepare("UPDATE campaigns SET status = 'closed', closed_at = datetime('now') WHERE id = ?").run(campaignId);
    return { refundedCents: 0, refundId: null as string | null };
  }

  try {
    await settleCampaign(campaignId, { trigger: "campaign close" });
  } catch (e) {
    logEvent("agent.settle", campaignId, `Final settlement skipped: ${(e as Error).message.slice(0, 200)}`);
  }

  const fresh = getCampaign(campaignId)!;
  const money = campaignMoney(fresh);
  const refundable = Math.max(0, fresh.funded_cents - money.committed - fresh.refunded_cents);
  let refundId: string | null = null;
  if (refundable > 0) {
    const r = await refundCapture(
      fresh.paypal_capture_id!,
      refundable,
      campaignId,
      `Unused budget from MotherTongue campaign "${fresh.title}": you only pay for verified recordings.`,
    );
    refundId = r.id;
    logEvent("paypal.refund", campaignId, `Refunded unused budget ${usd(refundable)} to funder (refund ${r.id}, ${r.status})`);
  }
  db()
    .prepare("UPDATE campaigns SET status = 'closed', closed_at = datetime('now'), refunded_cents = refunded_cents + ?, paypal_refund_id = COALESCE(?, paypal_refund_id) WHERE id = ?")
    .run(refundable, refundId, campaignId);
  return { refundedCents: refundable, refundId };
}

export function speakerUnpaidCents(campaignId: string, contributorId: string): number {
  const r = db()
    .prepare("SELECT COALESCE(SUM(price_cents),0) AS t FROM clips WHERE campaign_id = ? AND contributor_id = ? AND verdict = 'accepted' AND payout_status = 'unpaid'")
    .get(campaignId, contributorId) as { t: number };
  return r.t;
}

export { clipCostCents };
