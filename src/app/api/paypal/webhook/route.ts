import { NextResponse } from "next/server";
import { db, logEvent } from "@/lib/db";
import { verifyWebhook } from "@/lib/paypal";
import { applyItemStatus } from "@/lib/settle";

type WebhookEvent = {
  id: string;
  event_type: string;
  summary?: string;
  resource?: Record<string, unknown> & {
    id?: string;
    batch_header?: { payout_batch_id?: string; batch_status?: string; sender_batch_header?: { sender_batch_id?: string } };
    payout_item_id?: string;
    transaction_status?: string;
    payout_item?: { sender_item_id?: string };
    custom_id?: string;
    amount?: { value?: string };
  };
};

export async function POST(req: Request) {
  const raw = await req.text();
  let event: WebhookEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  let verification: string;
  try {
    verification = await verifyWebhook(req.headers, event);
  } catch (e) {
    verification = `ERROR ${(e as Error).message.slice(0, 80)}`;
  }
  if (verification === "FAILURE" || verification.startsWith("ERROR")) {
    logEvent("paypal.webhook", null, `Rejected ${event.event_type} (${verification})`);
    return NextResponse.json({ error: "verification failed" }, { status: 400 });
  }

  const r = event.resource ?? {};
  const d = db();
  switch (event.event_type) {
    case "PAYMENT.PAYOUTSBATCH.SUCCESS":
    case "PAYMENT.PAYOUTSBATCH.PROCESSING":
    case "PAYMENT.PAYOUTSBATCH.DENIED": {
      const sid = r.batch_header?.sender_batch_header?.sender_batch_id;
      if (sid) d.prepare("UPDATE payouts SET status = ? WHERE id = ?").run(r.batch_header?.batch_status ?? event.event_type.split(".").pop() ?? "UNKNOWN", sid);
      break;
    }
    case "PAYMENT.PAYOUTS-ITEM.SUCCEEDED":
    case "PAYMENT.PAYOUTS-ITEM.UNCLAIMED":
    case "PAYMENT.PAYOUTS-ITEM.FAILED":
    case "PAYMENT.PAYOUTS-ITEM.RETURNED":
    case "PAYMENT.PAYOUTS-ITEM.BLOCKED":
    case "PAYMENT.PAYOUTS-ITEM.DENIED":
    case "PAYMENT.PAYOUTS-ITEM.HELD":
    case "PAYMENT.PAYOUTS-ITEM.REFUNDED": {
      const sid = r.payout_item?.sender_item_id;
      if (sid) applyItemStatus(sid, r.payout_item_id, r.transaction_status ?? event.event_type.split(".").pop());
      break;
    }
    case "PAYMENT.CAPTURE.COMPLETED": {
      // backup path if the funder closed the tab before the return URL ran
      const campaignId = r.custom_id;
      if (campaignId && r.id) {
        d.prepare(
          "UPDATE campaigns SET paypal_capture_id = ?, funded_cents = ?, status = 'live' WHERE id = ? AND paypal_capture_id IS NULL",
        ).run(r.id, Math.round(parseFloat(r.amount?.value ?? "0") * 100), campaignId);
      }
      break;
    }
    default:
      break;
  }
  logEvent("paypal.webhook", r.custom_id ? String(r.custom_id) : null, `Webhook ${event.event_type} (signature: ${verification})`, {
    id: event.id,
    summary: event.summary,
  });
  return NextResponse.json({ ok: true });
}
