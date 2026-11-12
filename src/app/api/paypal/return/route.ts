import { NextResponse } from "next/server";
import { db, getCampaign, logEvent } from "@/lib/db";
import { captureOrder, getOrder, PayPalError } from "@/lib/paypal";
import { baseUrl } from "@/lib/session";

/** PayPal redirects the funder here after approval: capture the order and open the campaign. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const campaignId = url.searchParams.get("campaign") || "";
  const orderId = url.searchParams.get("token") || "";
  const base = baseUrl(req);
  const campaign = getCampaign(campaignId);
  if (!campaign || !orderId || campaign.paypal_order_id !== orderId) {
    return NextResponse.redirect(`${base}/campaigns/${campaignId}?error=order_mismatch`);
  }
  if (campaign.paypal_capture_id) return NextResponse.redirect(`${base}/campaigns/${campaignId}?funded=1`);

  try {
    let order;
    try {
      order = await captureOrder(orderId, campaignId);
    } catch (e) {
      // already captured (e.g. refresh) -> read it back
      if (e instanceof PayPalError && e.issue === "ORDER_ALREADY_CAPTURED") order = await getOrder(orderId, campaignId);
      else throw e;
    }
    const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
    if (!capture || capture.status !== "COMPLETED") {
      logEvent("paypal.capture", campaignId, `Capture not completed (status ${capture?.status ?? order.status})`);
      return NextResponse.redirect(`${base}/campaigns/${campaignId}?error=capture_${(capture?.status ?? order.status).toLowerCase()}`);
    }
    const cents = Math.round(parseFloat(capture.amount.value) * 100);
    db()
      .prepare("UPDATE campaigns SET paypal_capture_id = ?, funded_cents = ?, status = 'live' WHERE id = ? AND paypal_capture_id IS NULL")
      .run(capture.id, cents, campaignId);
    logEvent("paypal.capture", campaignId, `Funded: captured ${capture.amount.value} USD (capture ${capture.id}) - campaign is live`, {
      payer: order.payer?.email_address,
    });
    return NextResponse.redirect(`${base}/campaigns/${campaignId}?funded=1`);
  } catch (e) {
    const issue = e instanceof PayPalError ? e.issue ?? String(e.status) : "error";
    logEvent("paypal.capture", campaignId, `Capture failed: ${issue}`);
    return NextResponse.redirect(`${base}/campaigns/${campaignId}?error=${encodeURIComponent(issue)}`);
  }
}
