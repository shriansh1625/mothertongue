import { NextResponse, after } from "next/server";
import { db, getCampaign, logEvent, type Prompt } from "@/lib/db";
import { processClip, ClipRejected } from "@/lib/judge";
import { settleCampaign, speakerUnpaidCents } from "@/lib/settle";
import { currentContributor } from "@/lib/session";

export async function POST(req: Request) {
  const contributor = await currentContributor();
  if (!contributor) return NextResponse.json({ error: "Join as a speaker first." }, { status: 401 });

  const form = await req.formData();
  const campaignId = String(form.get("campaignId") || "");
  const promptId = String(form.get("promptId") || "");
  const file = form.get("audio");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "No audio received." }, { status: 400 });

  const campaign = getCampaign(campaignId);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  const prompt = db().prepare("SELECT * FROM prompts WHERE id = ? AND campaign_id = ?").get(promptId, campaignId) as Prompt | undefined;
  if (!prompt) return NextResponse.json({ error: "Unknown sentence" }, { status: 400 });

  try {
    const audio = new Uint8Array(await file.arrayBuffer());
    const { clip, autoSettle } = await processClip({ campaign, prompt, contributor, audio, mime: file.type || "audio/webm" });

    const threshold = Number(process.env.SETTLE_THRESHOLD_CENTS ?? 100);
    if (autoSettle && threshold > 0 && speakerUnpaidCents(campaignId, contributor.id) >= threshold) {
      after(async () => {
        try {
          await settleCampaign(campaignId, { contributorId: contributor.id, trigger: `auto: ${contributor.display_name} reached payout threshold` });
        } catch (e) {
          logEvent("agent.settle", campaignId, `Auto-settle failed: ${(e as Error).message.slice(0, 200)}`);
        }
      });
    }

    return NextResponse.json({
      id: clip.id,
      verdict: clip.verdict,
      explanation: clip.explanation,
      explanationEn: clip.explanation_en,
      transcript: clip.transcript,
      matchScore: clip.match_score,
      priceCents: clip.price_cents,
      judge: clip.judge,
      reasons: clip.reasons ? JSON.parse(clip.reasons) : [],
    });
  } catch (e) {
    if (e instanceof ClipRejected) return NextResponse.json({ error: e.message }, { status: 422 });
    logEvent("ai.judge", campaignId, `Clip processing error: ${(e as Error).message.slice(0, 200)}`);
    return NextResponse.json({ error: "We couldn't process that recording. Please try again." }, { status: 502 });
  }
}
