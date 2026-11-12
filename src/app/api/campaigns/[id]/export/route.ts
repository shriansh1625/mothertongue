import { db, getCampaign } from "@/lib/db";
import { baseUrl } from "@/lib/session";

/** Dataset manifest: every accepted clip with transcript, provenance and the PayPal payout that paid for it. */
export async function GET(req: Request, ctx: RouteContext<"/api/campaigns/[id]/export">) {
  const { id } = await ctx.params;
  const campaign = getCampaign(id);
  if (!campaign) return new Response("Not found", { status: 404 });
  const rows = db()
    .prepare(
      `SELECT c.id, p.text AS sentence, p.gloss, c.transcript, c.detected_language, c.duration_s, c.match_score, c.judge,
              c.contributor_id, c.price_cents, c.payout_status, c.payout_item_id, po.paypal_batch_id, pi.paypal_item_id, c.created_at
       FROM clips c JOIN prompts p ON p.id = c.prompt_id
       LEFT JOIN payouts po ON po.id = c.payout_id
       LEFT JOIN payout_items pi ON pi.id = c.payout_item_id
       WHERE c.campaign_id = ? AND c.verdict = 'accepted' ORDER BY c.created_at`,
    )
    .all(id) as Record<string, unknown>[];
  const base = baseUrl(req);
  const cols = [
    "clip_id",
    "audio_url",
    "language",
    "sentence",
    "english_gloss",
    "asr_transcript",
    "asr_detected_language",
    "duration_s",
    "similarity",
    "judged_by",
    "speaker_pseudonym",
    "paid_usd",
    "payout_status",
    "paypal_payout_batch_id",
    "paypal_payout_item_id",
    "recorded_at",
  ];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        `${base}/api/clips/${r.id}/audio`,
        campaign.language_code,
        r.sentence,
        r.gloss,
        r.transcript,
        r.detected_language,
        r.duration_s,
        typeof r.match_score === "number" ? r.match_score.toFixed(3) : "",
        r.judge,
        String(r.contributor_id).slice(-6),
        ((r.price_cents as number) / 100).toFixed(2),
        r.payout_status,
        r.paypal_batch_id,
        r.paypal_item_id,
        r.created_at,
      ]
        .map(esc)
        .join(","),
    );
  }
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mothertongue-${campaign.language_code}-${id}.csv"`,
    },
  });
}
