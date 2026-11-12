import { getCampaign } from "@/lib/db";
import { isOwner } from "@/lib/session";

/** Sandbox buyer login as a file, so the campaign page never prints the email or password. */
export async function GET(req: Request) {
  const campaignId = new URL(req.url).searchParams.get("campaign")?.trim() || "";
  const campaign = campaignId ? getCampaign(campaignId) : undefined;
  if (!campaign || !(await isOwner(campaign))) {
    return new Response("Only the funder of this campaign can download the sandbox login.\n", { status: 403 });
  }

  const email = process.env.DEMO_BUYER_EMAIL?.trim();
  const password = process.env.DEMO_BUYER_PASSWORD?.trim();
  if (!email) {
    return new Response("Sandbox buyer login is not configured.\n", { status: 404 });
  }

  const body = [
    "MotherTongue — PayPal sandbox buyer",
    "",
    "Use this account on the PayPal sandbox checkout screen.",
    "No real money moves. A real PayPal login will not work here.",
    "",
    `Email: ${email}`,
    `Password: ${password || "(not set)"}`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": 'attachment; filename="mothertongue-sandbox-buyer.txt"',
      "Cache-Control": "no-store",
    },
  });
}
