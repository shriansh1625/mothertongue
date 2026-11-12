# MotherTongue: get paid to teach AI your language

**Speakers of under-served languages record short sentences. AI verifies every clip. PayPal pays them, anywhere. Funders pay only for verified data.**

Built by **SynapSoul Labs** for the **PayPal AI Hackathon 2026** · PayPal **sandbox** · MIT licensed

| | |
|---|---|
| 🌐 Live demo | **https://REPLACE-WITH-RENDER-URL** |
| 🎬 Demo video (< 3 min) | **https://youtu.be/REPLACE** |
| 🧪 Judge sandbox buyer | see [Judge quick test](#judge-quick-test-3-minutes) |

---

## The problem

Voice AI works well in English and fails for billions of people. Regional languages, dialects and accents (Bhojpuri, rural Hindi, Tagalog, Swahili, Yoruba…) have very little recorded speech. Health hotlines, farm-advice lines and banking assistants built for these communities stumble because their speech recognisers have never heard them.

Teams that need this data (health NGOs, universities, AI labs) hit two walls:

1. **Paying thousands of speakers in dozens of countries** is a nightmare of bank details, currencies and small amounts.
2. **Checking quality by hand** costs more than the clips themselves, so either nobody gets paid fairly or the data is junk.

## What MotherTongue does

| Step | Who | What happens | PayPal | AI |
|---|---|---|---|---|
| 1. Fund | NGO / lab / researcher | Describes the speech it needs. **Claude** writes native-script recording prompts and explains its design. The funder pays the budget at **PayPal Checkout**. | Orders v2 create → buyer approval → capture | Claude Opus 5.5 campaign designer |
| 2. Record | Native speakers, anywhere | Reads sentences aloud in the browser, with no app to install. | | |
| 3. Verify | AI judge + guardrails | **Whisper** transcribes and detects the language. **Claude** judges the clip against the expected sentence and writes feedback **in the speaker's own language**. Deterministic guardrails block payment whenever the AI and the signals disagree. | | Whisper large-v3-turbo + Claude Opus 5.5 |
| 4. Pay | Settlement agent | Batches verified, unpaid clips and pays each speaker through **PayPal Payouts**. It writes a ledger note, applies velocity holds and enforces the budget. Webhooks confirm every item. | Payouts batch + item webhooks | Claude writes the settlement note |
| 5. Refund | Funder | On close, any unused budget is **refunded automatically** through PayPal. The funder downloads a dataset manifest where each clip carries its PayPal payout ID as proof of payment. | Payments v2 refund | |

> **Why AI is essential:** at $0.25 a clip, a human reviewer costs more than the clip. Automatic verification is what makes paying per clip, worldwide, viable.
> **Why PayPal is essential:** payouts to 200+ markets from one batch call, buyer-protected funding, and refunds without bank plumbing.

---

## Judge quick test (3 minutes)

1. Open the live demo and click **Fund a language**. Pick an example (e.g. *Hindi, rural UP accent*), set a $5 budget, and click **Design campaign with AI**.
2. Click **PayPal · Fund $5.00** and log in with the sandbox buyer below. You return to a **live** campaign that shows the PayPal capture ID.
3. Click **Record for this campaign**, join with a sandbox **personal** email (below), allow the microphone, and read a sentence. Within seconds you see the AI verdict, what it heard, and why.
4. Back on the campaign page, click **Run settlement agent**. A PayPal Payouts batch pays the speaker. Watch the status turn **Paid via PayPal**.
5. Click **Close campaign & refund unused budget**. The rest of the $5 is refunded to the sandbox buyer.
6. Open **Ledger** to see every PayPal call, webhook and AI decision.

| Sandbox account | Email | Password |
|---|---|---|
| Buyer (funder) | `REPLACE@personal.example.com` | `REPLACE` |
| Speaker (payout receiver) | `REPLACE@personal.example.com` | `REPLACE` |

Can't speak the campaign's language? Record yourself saying something else and watch the AI reject it, with an explanation of why.

---

## PayPal integration

| PayPal capability | Endpoint | Where | Used for |
|---|---|---|---|
| OAuth 2.0 client credentials | `POST /v1/oauth2/token` | `src/lib/paypal.ts` | Server-side token, cached and refreshed before its ~8 h expiry |
| **Orders v2** | `POST /v2/checkout/orders`, `POST /v2/checkout/orders/{id}/capture`, `GET /v2/checkout/orders/{id}` | `src/lib/paypal.ts`, `src/app/api/campaigns/[id]/fund`, `src/app/api/paypal/return` | Funding a campaign (buyer approval via `payer-action` link, `PayPal-Request-Id` idempotency) |
| **Payouts** | `POST /v1/payments/payouts`, `GET /v1/payments/payouts/{batch}` | `src/lib/settle.ts` | One batch pays every verified speaker. `sender_batch_id` doubles as the idempotency key. |
| **Payments v2 refunds** | `POST /v2/payments/captures/{id}/refund` | `src/lib/settle.ts` (`closeCampaign`) | Automatic refund of the unused budget |
| **Webhooks** | `POST /v1/notifications/verify-webhook-signature` | `src/app/api/paypal/webhook` | Signature-verified `PAYMENT.PAYOUTS-ITEM.*`, `PAYMENT.PAYOUTSBATCH.*`, `PAYMENT.CAPTURE.COMPLETED` |

## AI

| Model | Role | What it decides | Where |
|---|---|---|---|
| **Claude Opus 5.5** (`claude-opus-5-5`, Anthropic SDK, structured outputs) | Campaign designer | Turns a plain-language brief into native-script prompts, pricing advice and a design rationale | `designCampaign()` in `src/lib/ai.ts` |
| **Claude Opus 5.5** | Clip judge | Accepted / rejected / needs review, with reason codes and feedback in the speaker's language. It knows to ignore ASR noise (script variants, diacritics). | `judgeClip()` in `src/lib/ai.ts` |
| **Claude Opus 5.5** | Settlement reviewer | Writes the funder's ledger summary and the thank-you note inside each PayPal payout | `writeSettlementNote()` |
| **Whisper large-v3-turbo** (Groq) | Speech-to-text + language ID | Transcript, detected language, no-speech probability, confidence | `transcribe()` |

### Guardrails (money only moves when the evidence agrees)

- Silence, empty transcripts or high no-speech probability are always rejected, whatever the AI says.
- AI says *accepted* but similarity is under 20%: downgraded to **review** (`guardrail:ai_signal_disagreement`).
- AI says *rejected* but similarity is 93% or more: upgraded to **review** (`guardrail:protect_speaker`).
- Duplicate audio (SHA-256) and re-recording an already-paid sentence are blocked before any AI spend.
- The settlement agent never pays beyond the funded budget, holds implausibly fast speakers for human review, and locks clips in a transaction so nothing is paid twice.

---

## Architecture

```
Browser (Next.js 16 / React 19)
  ├─ Funder: brief ──► /api/campaigns ──► Claude (design) ──► SQLite
  │          fund  ──► /api/campaigns/:id/fund ──► PayPal Orders v2 ──► approve ──► /api/paypal/return ──► capture
  ├─ Speaker: MediaRecorder ──► /api/clips ──► Whisper ──► Claude judge ──► guardrails ──► SQLite
  │                                         └─(threshold)─► settlement agent ──► PayPal Payouts
  └─ Funder: settle / close ──► Payouts batch / Payments v2 refund
PayPal webhooks ──► /api/paypal/webhook (signature verified) ──► clip + payout status
Everything ──► events table ──► /ledger
```

- **Stack:** Next.js 16 (App Router, route handlers), TypeScript, Tailwind CSS 4, Node 22 built-in `node:sqlite` (no external DB), `@anthropic-ai/sdk`, zod
- **Hosting:** Render web service with a 1 GB persistent disk (`render.yaml`)

## Run it locally

Requirements: Node 22+, a PayPal developer account (sandbox), an Anthropic API key, and a Groq API key.

```bash
git clone https://github.com/shriansh1625/mothertongue && cd mothertongue
npm install
cp .env.example .env.local   # fill in the keys (see below)
node --env-file=.env.local scripts/smoke.mjs you-personal@example.com   # optional: checks every credential
npm run dev                  # http://localhost:3000
```

PayPal sandbox setup (≈5 minutes):

1. At developer.paypal.com → Sandbox → Accounts, create a **US Business** account and two **US Personal** accounts (funder and speaker). India-region sandbox accounts cannot send Payouts.
2. Under Apps & Credentials (Sandbox), create an app linked to the US business account, copy the Client ID and secret, and make sure **Payouts** is enabled.
3. Optional: add a webhook pointing to `https://<your-host>/api/paypal/webhook` for the `PAYMENT.PAYOUTS*` and `PAYMENT.CAPTURE.COMPLETED` events, then put its ID in `PAYPAL_WEBHOOK_ID`.

| Variable | Purpose |
|---|---|
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Sandbox REST app |
| `PAYPAL_WEBHOOK_ID` | Enables webhook signature verification |
| `ANTHROPIC_API_KEY` | Claude (design, judging, settlement notes) |
| `GROQ_API_KEY` | Whisper speech-to-text |
| `APP_BASE_URL` | Public URL used for the PayPal return/cancel URLs |
| `DATA_DIR` | SQLite location (Render: `/var/data`) |
| `SETTLE_THRESHOLD_CENTS` | Auto-pay a speaker once verified earnings reach this amount (default 100) |

## Built during the hackathon

MotherTongue is a **new project**, written from scratch on Nov 12, 2026, during the submission period (see the commit history). The team's earlier work, SynapSoul's evidence-first research and AI-safety tools, informed the design principles: inspectable reasoning, and people in charge of money. No earlier code was reused.

## Limitations and next steps

- Sandbox only. Production needs PayPal Payouts approval, KYC for high-earning speakers and per-country tax handling.
- The demo has no funder accounts: whoever creates a campaign controls it, via a cookie.
- Next steps: Hyperwallet for large speaker networks, speaker-level quality reputation, dialect-aware ASR models fine-tuned on the collected data, and dataset licensing back to communities.

## License

MIT, © 2026 Shriansh Vikram Singh (SynapSoul Labs)
