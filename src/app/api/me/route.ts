import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentContributor } from "@/lib/session";
import { refreshPayout } from "@/lib/settle";

/** Speaker's clips + payout status for one campaign (polled by the recorder). */
export async function GET(req: Request) {
  const me = await currentContributor();
  if (!me) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const campaignId = new URL(req.url).searchParams.get("campaign") || "";
  const d = db();

  // nudge any queued payouts for this speaker (cheap: one GET per pending batch)
  const pending = d
    .prepare(
      "SELECT DISTINCT payout_id FROM clips WHERE contributor_id = ? AND campaign_id = ? AND payout_status = 'queued' AND payout_id IS NOT NULL",
    )
    .all(me.id, campaignId) as { payout_id: string }[];
  for (const p of pending.slice(0, 3)) {
    try {
      await refreshPayout(p.payout_id);
    } catch {}
  }

  const clips = d
    .prepare(
      `SELECT c.id, c.prompt_id, c.verdict, c.explanation, c.price_cents, c.payout_status, pi.paypal_item_id, po.paypal_batch_id, c.created_at
       FROM clips c LEFT JOIN payout_items pi ON pi.id = c.payout_item_id LEFT JOIN payouts po ON po.id = c.payout_id
       WHERE c.contributor_id = ? AND c.campaign_id = ? ORDER BY c.created_at DESC`,
    )
    .all(me.id, campaignId);
  const totals = d
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN verdict='accepted' THEN price_cents END),0) AS earned,
         COALESCE(SUM(CASE WHEN verdict='accepted' AND payout_status='paid' THEN price_cents END),0) AS paid
       FROM clips WHERE contributor_id = ? AND campaign_id = ?`,
    )
    .get(me.id, campaignId);
  return NextResponse.json({ me: { name: me.display_name, email: me.paypal_email, uiLanguage: me.ui_language }, clips, totals });
}
