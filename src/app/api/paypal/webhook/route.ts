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
    supplementary_data?: { related_ids?: { order_id?: string } };
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
  if (verification !== "SUCCESS") {
    // unverified (e.g. PAYPAL_WEBHOOK_ID unset): never change state. The return URL and payout polling cover these paths.
    logEvent("paypal.webhook", null, `Ignored unverified ${event.event_type} (signature: ${verification})`, { id: event.id });
    return NextResponse.json({ ok: true, ignored: true });
  }

  const r = event.resource ?? {};
  const d = db();
  switch (event.event_type) {
    case "PAYMENT.PAYOUTSBATCH.SUCCESS":
    case "PAYMENT.PAYOUTSBATCH.PROCESSING":
    case "PAYMENT.PAYOUTSBATCH.DENIED": {
      const sid = r.batch_header?.sender_batch_header?.sender_batch_id;
      if (sid) {
        d.prepare("UPDATE payouts SET status = ? WHERE id = ?").run(r.batch_header?.batch_status ?? event.event_type.split(".").pop() ?? "UNKNOWN", sid);
        if (event.event_type === "PAYMENT.PAYOUTSBATCH.DENIED") {
          // the whole batch was refused: release its clips so a later settlement can retry them
          d.prepare("UPDATE clips SET payout_status = 'unpaid', payout_id = NULL, payout_item_id = NULL WHERE payout_id = ? AND payout_status = 'queued'").run(sid);
        }
      }
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
      // backup path if the funder closed the tab before the return URL ran.
      // only a draft campaign, for the order we created, at the exact budget, can go live.
      const campaignId = typeof r.custom_id === "string" ? r.custom_id : "";
      const captureId = typeof r.id === "string" ? r.id : "";
      const cents = Math.round(parseFloat(r.amount?.value ?? "0") * 100);
      const orderId = r.supplementary_data?.related_ids?.order_id;
      if (campaignId && captureId && Number.isFinite(cents) && cents > 0) {
        const row = d
          .prepare("SELECT status, budget_cents, paypal_order_id, paypal_capture_id FROM campaigns WHERE id = ?")
          .get(campaignId) as { status: string; budget_cents: number; paypal_order_id: string | null; paypal_capture_id: string | null } | undefined;
        const orderOk = !orderId || !row?.paypal_order_id || orderId === row.paypal_order_id;
        if (row && row.status === "draft" && !row.paypal_capture_id && row.budget_cents === cents && orderOk) {
          d.prepare(
            "UPDATE campaigns SET paypal_capture_id = ?, funded_cents = ?, status = 'live' WHERE id = ? AND status = 'draft' AND paypal_capture_id IS NULL AND budget_cents = ?",
          ).run(captureId, cents, campaignId, cents);
        } else {
          logEvent("paypal.webhook", campaignId, `Ignored CAPTURE.COMPLETED (status ${row?.status ?? "missing"}, ${cents} cents)`);
        }
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
