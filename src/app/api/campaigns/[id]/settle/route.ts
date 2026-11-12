import { NextResponse } from "next/server";
import { getCampaign } from "@/lib/db";
import { settleCampaign } from "@/lib/settle";
import { isOwner } from "@/lib/session";
import { PayPalError } from "@/lib/paypal";

export async function POST(_req: Request, ctx: RouteContext<"/api/campaigns/[id]/settle">) {
  const { id } = await ctx.params;
  const campaign = getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!(await isOwner(campaign))) return NextResponse.json({ error: "Only the funder can run settlement." }, { status: 403 });
  try {
    const r = await settleCampaign(id, { trigger: "funder ran settlement" });
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof PayPalError ? `PayPal error: ${e.issue ?? e.status}` : (e as Error).message;
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
