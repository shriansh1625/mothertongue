import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const g = globalThis as unknown as { __mtdb?: DatabaseSync; __mtmigrated?: number };
const MIGRATION_VERSION = 1;

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
  // idempotent migrations (also run when the cached connection survives a hot reload)
  if (g.__mtmigrated !== MIGRATION_VERSION) {
    const cols = g.__mtdb.prepare("PRAGMA table_info(campaigns)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "ai_suggested_price_cents")) {
      g.__mtdb.exec("ALTER TABLE campaigns ADD COLUMN ai_suggested_price_cents INTEGER");
    }
    g.__mtmigrated = MIGRATION_VERSION;
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
  status: "draft" | "live" | "closing" | "closed";
  owner_token: string;
  ai_rationale: string | null;
  ai_suggested_price_cents: number | null;
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

/**
 * Money still owed for this campaign.
 * Committed = accepted clips that are paid or can still be paid, times (price + fee).
 * Failed payouts and velocity holds (no payout item yet) are not committed, so closing
 * refunds that money. This is the same number the close refund uses.
 */
export function campaignMoney(c: Campaign) {
  const row = db()
    .prepare(
      `SELECT COUNT(*) AS accepted,
              SUM(CASE WHEN NOT (payout_status = 'failed' OR (payout_status = 'held' AND payout_item_id IS NULL)) THEN 1 ELSE 0 END) AS payable,
              SUM(CASE WHEN payout_status = 'paid' THEN price_cents ELSE 0 END) AS paid
       FROM clips WHERE campaign_id = ? AND verdict = 'accepted'`,
    )
    .get(c.id) as { accepted: number; payable: number | null; paid: number | null };
  const cost = clipCostCents(c);
  const payable = Number(row.payable ?? 0);
  const committed = payable * cost;
  const remaining = Math.max(0, c.funded_cents - committed - c.refunded_cents);
  return {
    accepted: row.accepted,
    payable,
    paidToSpeakers: Number(row.paid ?? 0),
    committed,
    remaining,
    clipsLeft: cost > 0 ? Math.floor(remaining / cost) : 0,
    cost,
  };
}

/** Audio types we accept and serve. Anything else is refused, never stored or returned as text/html. */
export const AUDIO_MIME_ALLOW = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav"] as const;

export function acceptedAudioMime(m: string | null | undefined): string | null {
  const base = (m || "").split(";")[0].trim().toLowerCase();
  return (AUDIO_MIME_ALLOW as readonly string[]).includes(base) ? base : null;
}

/** Serve-time fallback. Unknown stored types become audio/webm so a browser will not execute them. */
export function safeAudioMime(m: string | null | undefined): string {
  return acceptedAudioMime(m) ?? "audio/webm";
}

/** Container magic bytes. Stops an HTML/SVG upload that only claims an audio content type. */
export function looksLikeAudio(buf: Uint8Array, mime: string): boolean {
  if (buf.byteLength < 12) return false;
  const ascii = (i: number, s: string) => {
    for (let n = 0; n < s.length; n++) if (buf[i + n] !== s.charCodeAt(n)) return false;
    return true;
  };
  if (mime === "audio/webm") return buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
  if (mime === "audio/ogg") return ascii(0, "OggS");
  if (mime === "audio/wav" || mime === "audio/x-wav") return ascii(0, "RIFF") && ascii(8, "WAVE");
  if (mime === "audio/mpeg") return ascii(0, "ID3") || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
  if (mime === "audio/mp4") {
    for (let i = 0; i + 4 <= Math.min(buf.byteLength, 64); i++) if (ascii(i, "ftyp")) return true;
    return false;
  }
  return false;
}

/** Cap stored audio so a flood of clips cannot fill the disk. Duplicates store no bytes. */
export const MAX_STORED_AUDIO_BYTES = 250 * 1024 * 1024;

export function storedAudioBytes(): number {
  const row = db().prepare("SELECT COALESCE(SUM(length(audio)), 0) AS n FROM clips").get() as { n: number };
  return Number(row.n) || 0;
}

export function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
