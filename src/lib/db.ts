import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const g = globalThis as unknown as { __mtdb?: DatabaseSync };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  brief TEXT NOT NULL,
  language_code TEXT NOT NULL,
  language_name TEXT NOT NULL,
  funder_name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  budget_cents INTEGER NOT NULL,
  fee_bps INTEGER NOT NULL DEFAULT 1000,
  status TEXT NOT NULL DEFAULT 'draft',
  owner_token TEXT NOT NULL,
  ai_rationale TEXT,
  paypal_order_id TEXT,
  paypal_capture_id TEXT,
  funded_cents INTEGER NOT NULL DEFAULT 0,
  paypal_refund_id TEXT,
  refunded_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);
CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  idx INTEGER NOT NULL,
  text TEXT NOT NULL,
  gloss TEXT
);
CREATE TABLE IF NOT EXISTS contributors (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  paypal_email TEXT NOT NULL UNIQUE,
  ui_language TEXT NOT NULL DEFAULT 'English',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS clips (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  prompt_id TEXT NOT NULL REFERENCES prompts(id),
  contributor_id TEXT NOT NULL REFERENCES contributors(id),
  audio BLOB NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  duration_s REAL,
  transcript TEXT,
  detected_language TEXT,
  match_score REAL,
  no_speech_prob REAL,
  avg_logprob REAL,
  verdict TEXT NOT NULL,
  reasons TEXT,
  explanation TEXT,
  explanation_en TEXT,
  judge TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  payout_status TEXT NOT NULL DEFAULT 'unpaid',
  payout_id TEXT,
  payout_item_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS clips_campaign ON clips(campaign_id);
CREATE INDEX IF NOT EXISTS clips_contributor ON clips(contributor_id);
CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  paypal_batch_id TEXT,
  status TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  item_count INTEGER NOT NULL,
  agent_summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS payout_items (
  id TEXT PRIMARY KEY,
  payout_id TEXT NOT NULL REFERENCES payouts(id),
  contributor_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  clip_ids TEXT NOT NULL,
  paypal_item_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING'
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  ref TEXT,
  summary TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export function db(): DatabaseSync {
  if (!g.__mtdb) {
    const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");
    fs.mkdirSync(dir, { recursive: true });
    const d = new DatabaseSync(path.join(dir, "mothertongue.db"));
    d.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    d.exec(SCHEMA);
    g.__mtdb = d;
  }
  return g.__mtdb;
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function sha256(buf: Uint8Array): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** Append-only activity log shown on the Ledger page (PayPal calls, webhooks, AI decisions). */
export function logEvent(kind: string, ref: string | null, summary: string, payload?: unknown) {
  try {
    db()
      .prepare("INSERT INTO events (kind, ref, summary, payload) VALUES (?, ?, ?, ?)")
      .run(kind, ref, summary.slice(0, 500), payload === undefined ? null : JSON.stringify(payload).slice(0, 20000));
  } catch {
    // logging must never break a money path
  }
}

export type Campaign = {
  id: string;
  title: string;
  brief: string;
  language_code: string;
  language_name: string;
  funder_name: string;
  price_cents: number;
  budget_cents: number;
  fee_bps: number;
  status: "draft" | "live" | "closed";
  owner_token: string;
  ai_rationale: string | null;
  paypal_order_id: string | null;
  paypal_capture_id: string | null;
  funded_cents: number;
  paypal_refund_id: string | null;
  refunded_cents: number;
  created_at: string;
  closed_at: string | null;
};

export type Prompt = { id: string; campaign_id: string; idx: number; text: string; gloss: string | null };

export type Contributor = {
  id: string;
  display_name: string;
  paypal_email: string;
  ui_language: string;
  created_at: string;
};

export type ClipRow = {
  id: string;
  campaign_id: string;
  prompt_id: string;
  contributor_id: string;
  mime: string;
  bytes: number;
  sha256: string;
  duration_s: number | null;
  transcript: string | null;
  detected_language: string | null;
  match_score: number | null;
  no_speech_prob: number | null;
  avg_logprob: number | null;
  verdict: "accepted" | "rejected" | "review";
  reasons: string | null;
  explanation: string | null;
  explanation_en: string | null;
  judge: string | null;
  price_cents: number;
  payout_status: "unpaid" | "queued" | "paid" | "failed" | "unclaimed" | "held";
  payout_id: string | null;
  payout_item_id: string | null;
  created_at: string;
};

export const CLIP_COLS =
  "id, campaign_id, prompt_id, contributor_id, mime, bytes, sha256, duration_s, transcript, detected_language, match_score, no_speech_prob, avg_logprob, verdict, reasons, explanation, explanation_en, judge, price_cents, payout_status, payout_id, payout_item_id, created_at";

export function getCampaign(id: string): Campaign | undefined {
  return db().prepare("SELECT * FROM campaigns WHERE id = ?").get(id) as Campaign | undefined;
}

export function getPrompts(campaignId: string): Prompt[] {
  return db().prepare("SELECT * FROM prompts WHERE campaign_id = ? ORDER BY idx").all(campaignId) as Prompt[];
}

/** Cost of one accepted clip to the funder: speaker price + platform fee. */
export function clipCostCents(c: Pick<Campaign, "price_cents" | "fee_bps">): number {
  return c.price_cents + Math.round((c.price_cents * c.fee_bps) / 10000);
}

/** Budget committed so far = every accepted clip (paid or not) x clip cost. */
export function campaignMoney(c: Campaign) {
  const row = db()
    .prepare(
      "SELECT COUNT(*) AS accepted, SUM(CASE WHEN payout_status = 'paid' THEN price_cents ELSE 0 END) AS paid FROM clips WHERE campaign_id = ? AND verdict = 'accepted'",
    )
    .get(c.id) as { accepted: number; paid: number | null };
  const cost = clipCostCents(c);
  const committed = row.accepted * cost;
  const remaining = Math.max(0, c.funded_cents - committed - c.refunded_cents);
  return {
    accepted: row.accepted,
    paidToSpeakers: row.paid ?? 0,
    committed,
    remaining,
    clipsLeft: cost > 0 ? Math.floor(remaining / cost) : 0,
    cost,
  };
}

export function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
