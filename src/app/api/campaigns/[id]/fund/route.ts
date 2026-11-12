import { NextResponse } from "next/server";
import { db, getCampaign, logEvent } from "@/lib/db";
import { createFundingOrder, PayPalError } from "@/lib/paypal";
import { baseUrl, isOwner } from "@/lib/session";

export async function POST(req: Request, ctx: RouteContext<"/api/campaigns/[id]/fund">) {
  const { id } = await ctx.params;
  const campaign = getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!(await isOwner(campaign))) return NextResponse.json({ error: "Only the funder can fund this campaign." }, { status: 403 });
  if (campaign.paypal_capture_id) return NextResponse.json({ error: "Already funded." }, { status: 409 });

  const base = baseUrl(req);
  try {
    const { order, approveUrl } = await createFundingOrder({
      campaignId: id,
      title: campaign.title,
      amountCents: campaign.budget_cents,
      returnUrl: `${base}/api/paypal/return?campaign=${id}`,
      cancelUrl: `${base}/campaigns/${id}?cancelled=1`,
    });
    db().prepare("UPDATE campaigns SET paypal_order_id = ? WHERE id = ?").run(order.id, id);
    logEvent("paypal.order", id, `Created PayPal order ${order.id} for ${(campaign.budget_cents / 100).toFixed(2)} USD`);
    return NextResponse.json({ approveUrl, orderId: order.id });
  } catch (e) {
    const msg = e instanceof PayPalError ? `PayPal error: ${e.issue ?? e.status}` : (e as Error).message;
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
