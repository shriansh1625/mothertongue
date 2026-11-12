// PayPal sandbox + AI smoke test.  Usage:  node --env-file=.env.local scripts/smoke.mjs [payout-receiver@personal.example.com]
// Verifies: OAuth token, Orders v2 create, Payouts (optional, sends $0.01 to a SANDBOX personal account), Groq Whisper + both Groq LLMs.
const BASE = process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
if (process.env.PAYPAL_ENV === "live") {
  console.error("Refusing to run the smoke test against LIVE PayPal.");
  process.exit(1);
}
const ok = (m) => console.log("  ✓ " + m);
const bad = (m) => console.log("  ✗ " + m);

async function main() {
  console.log("PayPal sandbox");
  const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const t = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!t.ok) return bad(`OAuth failed (${t.status}): ${await t.text()}`);
  const { access_token, scope } = await t.json();
  ok("OAuth token");
  ok(`Payouts scope: ${/payouts/.test(scope) ? "yes" : "NOT FOUND - enable Payouts on the app"}`);
  const H = { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" };

  const o = await fetch(`${BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ intent: "CAPTURE", purchase_units: [{ amount: { currency_code: "USD", value: "1.00" } }] }),
  });
  const oj = await o.json();
  o.ok ? ok(`Orders v2 create -> ${oj.id} (${oj.status})`) : bad(`Orders v2 create failed: ${JSON.stringify(oj).slice(0, 300)}`);

  const receiver = process.argv[2];
  if (receiver) {
    const p = await fetch(`${BASE}/v1/payments/payouts`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        sender_batch_header: { sender_batch_id: `smoke-${Date.now()}`, email_subject: "MotherTongue smoke test" },
        items: [{ recipient_type: "EMAIL", receiver, amount: { currency: "USD", value: "0.01" }, sender_item_id: "smoke-1" }],
      }),
    });
    const pj = await p.json();
    p.ok
      ? ok(`Payouts batch -> ${pj.batch_header?.payout_batch_id} (${pj.batch_header?.batch_status})`)
      : bad(`Payouts failed: ${JSON.stringify(pj).slice(0, 400)}`);
  } else {
    console.log("  - skipped Payouts (pass a sandbox PERSONAL account email to test)");
  }

  console.log("AI");
  if (process.env.GROQ_API_KEY) {
    const g = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` } });
    g.ok ? ok("Groq key works (Whisper)") : bad(`Groq key failed (${g.status})`);
  } else bad("GROQ_API_KEY missing");
  if (process.env.GROQ_API_KEY) {
    for (const model of ["openai/gpt-oss-120b", "qwen/qwen3.8-27b"]) {
      const c = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, max_completion_tokens: 50, messages: [{ role: "user", content: "Reply with: ok" }] }),
      });
      c.ok ? ok(`Groq chat ${model}`) : bad(`Groq chat ${model} failed (${c.status})`);
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
