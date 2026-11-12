/**
 * PayPal REST client (sandbox by default).
 * Covers the money paths MotherTongue uses:
 *   Orders v2 (fund a campaign) -> Payments v2 (refund unused budget) -> Payouts (pay speakers) -> Webhooks.
 */
import { logEvent } from "./db";

const BASE =
  process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

export const PAYPAL_WEB =
  process.env.PAYPAL_ENV === "live" ? "https://www.paypal.com" : "https://www.sandbox.paypal.com";

export class PayPalError extends Error {
  constructor(
    public op: string,
    public status: number,
    public body: string,
    public debugId: string | null,
  ) {
    super(`PayPal ${op} failed (${status})${debugId ? ` [debug ${debugId}]` : ""}: ${body.slice(0, 400)}`);
  }
  /** PayPal error "name"/"issue" if present, e.g. INSUFFICIENT_FUNDS */
  get issue(): string | undefined {
    try {
      const j = JSON.parse(this.body);
      return j?.details?.[0]?.issue || j?.name;
    } catch {
      return undefined;
    }
  }
}

export function paypalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

const g = globalThis as unknown as { __pptoken?: { token: string; exp: number } };

async function accessToken(): Promise<string> {
  const cached = g.__pptoken;
  if (cached && Date.now() < cached.exp - 5 * 60_000) return cached.token;
  if (!paypalConfigured()) throw new Error("PayPal is not configured: set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET");
  const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new PayPalError("oauth.token", res.status, text, res.headers.get("paypal-debug-id"));
  const j = JSON.parse(text) as { access_token: string; expires_in: number };
  g.__pptoken = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

type CallOpts = { requestId?: string; ref?: string | null };

async function call<T>(op: string, method: "GET" | "POST", path: string, body?: unknown, opts: CallOpts = {}): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await accessToken()}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (opts.requestId) headers["PayPal-Request-Id"] = opts.requestId;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  const debugId = res.headers.get("paypal-debug-id");
  logEvent("paypal.api", opts.ref ?? null, `${op}: ${method} ${path.split("?")[0]} -> ${res.status}`, {
    status: res.status,
    debugId,
    requestId: opts.requestId,
  });
  if (!res.ok) throw new PayPalError(op, res.status, text, debugId);
  return (text ? JSON.parse(text) : {}) as T;
}

// ---------- Orders v2: fund a campaign ----------

type Link = { href: string; rel: string; method?: string };

export type PayPalOrder = {
  id: string;
  status: string;
  links?: Link[];
  purchase_units?: Array<{
    reference_id?: string;
    custom_id?: string;
    payments?: { captures?: Array<{ id: string; status: string; amount: { value: string; currency_code: string } }> };
  }>;
  payer?: { email_address?: string; name?: { given_name?: string; surname?: string } };
};

export async function createFundingOrder(input: {
  campaignId: string;
  title: string;
  amountCents: number;
  returnUrl: string;
  cancelUrl: string;
}): Promise<{ order: PayPalOrder; approveUrl: string }> {
  const order = await call<PayPalOrder>(
    "orders.create",
    "POST",
    "/v2/checkout/orders",
    {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.campaignId,
          custom_id: input.campaignId,
          description: `MotherTongue speech-data campaign: ${input.title}`.slice(0, 127),
          soft_descriptor: "MOTHERTONGUE",
          amount: { currency_code: "USD", value: (input.amountCents / 100).toFixed(2) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "MotherTongue",
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    },
    { requestId: `fund-${input.campaignId}-${Date.now()}`, ref: input.campaignId },
  );
  const approveUrl = order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
  if (!approveUrl) throw new Error("PayPal did not return an approval link");
  return { order, approveUrl };
}

export async function captureOrder(orderId: string, ref: string): Promise<PayPalOrder> {
  return call<PayPalOrder>("orders.capture", "POST", `/v2/checkout/orders/${orderId}/capture`, {}, {
    requestId: `capture-${orderId}`,
    ref,
  });
}

export async function getOrder(orderId: string, ref: string): Promise<PayPalOrder> {
  return call<PayPalOrder>("orders.get", "GET", `/v2/checkout/orders/${orderId}`, undefined, { ref });
}

// ---------- Payments v2: refund the unused budget ----------

export type PayPalRefund = { id: string; status: string; amount?: { value: string; currency_code: string } };

export async function refundCapture(captureId: string, amountCents: number, ref: string, note: string): Promise<PayPalRefund> {
  return call<PayPalRefund>(
    "payments.refund",
    "POST",
    `/v2/payments/captures/${captureId}/refund`,
    {
      amount: { currency_code: "USD", value: (amountCents / 100).toFixed(2) },
      note_to_payer: note.slice(0, 255),
    },
    // Stable per campaign so a retry of the same close replays this refund instead of issuing another.
    { requestId: `refund-${ref}`, ref },
  );
}

// ---------- Payouts: pay many speakers in one batch ----------

export type PayoutItemInput = { senderItemId: string; email: string; amountCents: number; note: string };

export type PayoutBatch = {
  batch_header: {
    payout_batch_id: string;
    batch_status: string;
    sender_batch_header?: { sender_batch_id: string };
    amount?: { value: string; currency: string };
  };
  items?: Array<{
    payout_item_id: string;
    transaction_id?: string;
    transaction_status?: string;
    payout_item: { sender_item_id?: string; receiver: string; amount: { value: string; currency: string } };
    errors?: { name?: string; message?: string };
  }>;
};

export async function createPayoutBatch(senderBatchId: string, items: PayoutItemInput[], ref: string): Promise<PayoutBatch> {
  return call<PayoutBatch>(
    "payouts.create",
    "POST",
    "/v1/payments/payouts",
    {
      sender_batch_header: {
        sender_batch_id: senderBatchId,
        email_subject: "You were paid for your voice recordings",
        email_message: "Thank you for helping AI understand your language. Your verified MotherTongue recordings have been paid.",
      },
      items: items.map((i) => ({
        recipient_type: "EMAIL",
        receiver: i.email,
        amount: { currency: "USD", value: (i.amountCents / 100).toFixed(2) },
        note: i.note.slice(0, 4000),
        sender_item_id: i.senderItemId,
        notification_language: "en-US",
      })),
    },
    { requestId: senderBatchId, ref },
  );
}

export async function getPayoutBatch(payoutBatchId: string, ref: string): Promise<PayoutBatch> {
  return call<PayoutBatch>("payouts.get", "GET", `/v1/payments/payouts/${payoutBatchId}?fields=batch_header,items`, undefined, {
    ref,
  });
}

// ---------- Webhooks ----------

export async function verifyWebhook(headers: Headers, event: unknown): Promise<"SUCCESS" | "FAILURE" | "SKIPPED"> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return "SKIPPED";
  const j = await call<{ verification_status: "SUCCESS" | "FAILURE" }>(
    "webhooks.verify",
    "POST",
    "/v1/notifications/verify-webhook-signature",
    {
      auth_algo: headers.get("paypal-auth-algo"),
      cert_url: headers.get("paypal-cert-url"),
      transmission_id: headers.get("paypal-transmission-id"),
      transmission_sig: headers.get("paypal-transmission-sig"),
      transmission_time: headers.get("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: event,
    },
  );
  return j.verification_status;
}

/** Map PayPal payout item transaction_status to our clip payout_status. */
export function clipStatusFromPayout(s: string | undefined): "queued" | "paid" | "failed" | "unclaimed" | "held" {
  switch ((s || "").toUpperCase()) {
    case "SUCCESS":
    case "SUCCEEDED":
      return "paid";
    case "UNCLAIMED":
      return "unclaimed";
    case "ONHOLD":
    case "HELD":
      return "held";
    case "FAILED":
    case "RETURNED":
    case "BLOCKED":
    case "REFUNDED":
    case "REVERSED":
    case "DENIED":
      return "failed";
    default:
      return "queued";
  }
}
