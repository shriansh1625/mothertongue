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
| 1. Fund | NGO / lab / researcher | Describes the speech it needs. An AI campaign designer writes native-script recording prompts, suggests a fair price per clip and explains its design. The funder pays the budget at **PayPal Checkout**. | Orders v2 create → buyer approval → capture | `openai/gpt-oss-120b` campaign designer |
| 2. Record | Native speakers, anywhere | Reads sentences aloud in the browser, with no app to install. | | |
| 3. Verify | AI judge + guardrails | **Whisper** transcribes and detects the language. A multilingual **Qwen3** judge checks the clip against the expected sentence and writes feedback **in the speaker's own language**. Deterministic guardrails block payment whenever the AI and the signals disagree. | | `whisper-large-v3-turbo` + `qwen/qwen3.8-27b` (fallback `openai/gpt-oss-20b`) |
| 4. Pay | Settlement agent | Batches verified, unpaid clips and pays each speaker through **PayPal Payouts**. It writes a ledger note, applies velocity holds and enforces the budget. Webhooks confirm every item. | Payouts batch + item webhooks | `openai/gpt-oss-120b` writes the ledger note and speaker thank-you |
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

All AI runs on **Groq** with a single `GROQ_API_KEY`. Every structured output is validated with **zod** before the app acts on it, and every model call is logged to the ledger.

| Model (Groq) | Role | What it decides | Where |
|---|---|---|---|
| **`whisper-large-v3-turbo`** | Speech-to-text + language ID | Transcript, detected language, duration, no-speech probability, average log-probability | `transcribe()` in `src/lib/ai.ts` |
| **`openai/gpt-oss-120b`** (strict JSON-schema output) | Campaign designer | Turns a plain-language brief into native-script prompts with English glosses, a suggested price per clip (clamped to 10–100¢) and a design rationale | `designCampaign()` in `src/lib/ai.ts` |
| **`qwen/qwen3.8-27b`** (JSON output, normalised, then zod-validated) | Clip judge | Accepted / rejected / review, with reason codes and feedback in the speaker's interface language plus English. Told to ignore ASR noise (script variants, diacritics, digits vs words). | `judgeClip()` in `src/lib/ai.ts`, called from `src/lib/judge.ts` |
| **`openai/gpt-oss-20b`** (strict JSON-schema output) | Fallback judge | Takes over automatically if the Qwen call fails or returns invalid output | `judgeClip()` |
| **`openai/gpt-oss-120b`** (strict JSON-schema output) | Settlement agent notes | Writes the funder's ledger summary for each payout batch and the thank-you note inside each PayPal payout | `writeSettlementNote()` in `src/lib/ai.ts`, called from `src/lib/settle.ts` |

Each model can be swapped with an env var (see below). If both judges fail, a conservative rules-based judge (transcript similarity + no-speech signal) decides and the guardrails still apply. If the note writer fails, the payout goes out with a plain default note.

### Guardrails (money only moves when the evidence agrees)

- Silence, empty transcripts or high no-speech probability are always rejected, whatever the AI says.
- AI says *accepted* but similarity is under 20%: downgraded to **review** (`guardrail:ai_signal_disagreement`).
- AI says *rejected* but similarity is 93% or more: upgraded to **review** (`guardrail:protect_speaker`).
- Duplicate audio (SHA-256) and re-recording a sentence the speaker already has accepted are blocked before any AI spend.
- The settlement agent never pays beyond the funded budget, holds implausibly fast speakers for human review, and locks clips in a transaction so nothing is paid twice.

---

## Architecture

```
Browser (Next.js 16 / React 19)
  ├─ Funder: brief ──► /api/campaigns ──► gpt-oss-120b (design) ──► SQLite
  │          fund  ──► /api/campaigns/:id/fund ──► PayPal Orders v2 ──► approve ──► /api/paypal/return ──► capture
  ├─ Speaker: MediaRecorder ──► /api/clips ──► Whisper ──► Qwen3 judge (gpt-oss-20b fallback) ──► guardrails ──► SQLite
  │                                         └─(threshold)─► settlement agent (gpt-oss-120b note) ──► PayPal Payouts
  └─ Funder: settle / close ──► Payouts batch / Payments v2 refund
PayPal webhooks ──► /api/paypal/webhook (signature verified) ──► clip + payout status
Everything ──► events table ──► /ledger
```

- **Stack:** Next.js 16 (App Router, route handlers), React 19, TypeScript, Tailwind CSS 4, Motion, Node 22 built-in `node:sqlite` (no external DB), zod. Groq (OpenAI-compatible API) and PayPal REST are called directly with `fetch`, with no SDKs.
- **Hosting:** Render web service with a 1 GB persistent disk (`render.yaml`)

## Run it locally

Requirements: Node 22+, a PayPal developer account (sandbox) and one Groq API key (console.groq.com), which covers speech-to-text, the designer, the judge and the settlement notes.

```bash
git clone https://github.com/shriansh1625/mothertongue && cd mothertongue
npm install
cp .env.example .env.local   # fill in the keys (see below)
node --env-file=.env.local scripts/smoke.mjs you-personal@example.com   # optional: checks every credential
npm run dev                  # http://localhost:3000
```

The smoke test refuses to run against live PayPal. It checks the PayPal OAuth token and Payouts scope, creates a sandbox Orders v2 order, sends a $0.01 sandbox payout if you pass a sandbox personal email, confirms the Groq key, and sends a test chat request to both Groq LLMs (`openai/gpt-oss-120b` and `qwen/qwen3.8-27b`).

PayPal sandbox setup (≈5 minutes):

1. At developer.paypal.com → Sandbox → Accounts, create a **US Business** account and two **US Personal** accounts (funder and speaker). India-region sandbox accounts cannot send Payouts.
2. Under Apps & Credentials (Sandbox), create an app linked to the US business account, copy the Client ID and secret, and make sure **Payouts** is enabled.
3. Optional: add a webhook pointing to `https://<your-host>/api/paypal/webhook` for the `PAYMENT.PAYOUTS*` and `PAYMENT.CAPTURE.COMPLETED` events, then put its ID in `PAYPAL_WEBHOOK_ID`.

| Variable | Purpose |
|---|---|
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Sandbox REST app |
| `PAYPAL_WEBHOOK_ID` | Optional. Enables webhook signature verification |
| `PAYPAL_ENV` | `sandbox` (default; this submission runs on sandbox only) |
| `GROQ_API_KEY` | All AI: Whisper speech-to-text, campaign designer, clip judge, settlement notes |
| `GROQ_STT_MODEL` | Optional override, default `whisper-large-v3-turbo` |
| `GROQ_DESIGN_MODEL` | Optional override for the designer and settlement notes, default `openai/gpt-oss-120b` |
| `GROQ_JUDGE_MODEL` | Optional override, default `qwen/qwen3.8-27b` |
| `GROQ_FALLBACK_JUDGE_MODEL` | Optional override, default `openai/gpt-oss-20b` |
| `APP_BASE_URL` | Public URL used for the PayPal return/cancel URLs |
| `DATA_DIR` | SQLite location (Render: `/var/data`) |
| `SETTLE_THRESHOLD_CENTS` | Auto-pay a speaker once verified, unpaid earnings reach this many cents (default 100, `0` = manual only) |

On Render, `render.yaml` presets `NODE_VERSION`, `DATA_DIR`, `PAYPAL_ENV` and `SETTLE_THRESHOLD_CENTS`; you fill in the PayPal credentials, `GROQ_API_KEY` and `APP_BASE_URL`.

## Design

- **Warm "paper and ink" identity:** cream paper backgrounds, ink-dark text, a single vermilion accent, Fraunces serif headings and Geist body text. PayPal yellow is reserved for PayPal actions.
- **Native scripts first:** recording prompts are shown in their own script (Devanagari and others) with the English gloss alongside.
- **Motion:** animations built with [Motion](https://motion.dev) (`motion/react`): spring hover and tap feedback, scroll reveals, layout animations and `AnimatePresence` transitions.
- **Generative backgrounds:** Haikei-style SVG scenes (blurry gradients, layered waves, blob scenes, circle scatter, grain) rendered as plain SVG on the server.
- **Accessible:** visible focus rings, labelled controls, and `prefers-reduced-motion` support, so animations calm down for users who ask for less motion.

## Built during the hackathon

MotherTongue is a **new project**, written from scratch on Nov 12, 2026, during the submission period (see the commit history). The team's earlier work, SynapSoul's evidence-first research and AI-safety tools, informed the design principles: inspectable reasoning, and people in charge of money. No earlier code was reused.

## Limitations and next steps

- Sandbox only. Production needs PayPal Payouts approval, KYC for high-earning speakers and per-country tax handling.
- The demo has no funder accounts: whoever creates a campaign controls it, via a cookie.
- Next steps: Hyperwallet for large speaker networks, speaker-level quality reputation, dialect-aware ASR models fine-tuned on the collected data, and dataset licensing back to communities.

## License

MIT, © 2026 Shriansh Vikram Singh (SynapSoul Labs)
