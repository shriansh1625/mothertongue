import { NextResponse } from "next/server";
import { getCampaign } from "@/lib/db";
import { closeCampaign } from "@/lib/settle";
import { isOwner } from "@/lib/session";
import { PayPalError } from "@/lib/paypal";

export async function POST(_req: Request, ctx: RouteContext<"/api/campaigns/[id]/close">) {
  const { id } = await ctx.params;
  const campaign = getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!(await isOwner(campaign))) return NextResponse.json({ error: "Only the funder can close this campaign." }, { status: 403 });
  if (campaign.status === "closed") {
    return NextResponse.json({ error: "This campaign is already closed." }, { status: 409 });
  }
  try {
    const r = await closeCampaign(id);
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof PayPalError ? `PayPal error: ${e.issue ?? e.status}` : (e as Error).message;
    const status = /already closed|already closing/i.test(msg) ? 409 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
