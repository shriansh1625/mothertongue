/**
 * AI layer.
 *  - Speech-to-text + language ID: Whisper (whisper-large-v3-turbo on Groq).
 *  - Reasoning: Claude Opus 5.5 with structured (zod-validated) outputs:
 *      1. Campaign designer: brief -> native-script recording prompts + pricing rationale
 *      2. Clip judge: transcript vs expected sentence -> verdict + feedback in the speaker's language
 *      3. Settlement reviewer: writes the human-readable note attached to each PayPal payout batch
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { logEvent } from "./db";

export const CLAUDE_MODEL = "claude-opus-5-5";
export const STT_MODEL = process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo";

export function claudeConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
export function sttConfigured() {
  return Boolean(process.env.GROQ_API_KEY);
}

const g = globalThis as unknown as { __anthropic?: Anthropic };
function client(): Anthropic {
  if (!g.__anthropic) g.__anthropic = new Anthropic({ maxRetries: 2, timeout: 60_000 });
  return g.__anthropic;
}

// ---------------- Speech-to-text ----------------

export type Transcription = {
  text: string;
  language: string | null;
  duration: number | null;
  avgLogprob: number | null;
  noSpeechProb: number | null;
};

export async function transcribe(audio: Uint8Array, mime: string): Promise<Transcription> {
  if (!sttConfigured()) throw new Error("Speech-to-text is not configured: set GROQ_API_KEY");
  const ext = mime.includes("ogg") ? "ogg" : mime.includes("mp4") || mime.includes("m4a") ? "m4a" : mime.includes("wav") ? "wav" : "webm";
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(audio)], { type: mime.split(";")[0] || "audio/webm" }), `clip.${ext}`);
  fd.append("model", STT_MODEL);
  fd.append("response_format", "verbose_json");
  fd.append("temperature", "0");
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: fd,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Speech-to-text failed (${res.status}): ${text.slice(0, 300)}`);
  const j = JSON.parse(text) as {
    text: string;
    language?: string;
    duration?: number;
    segments?: Array<{ avg_logprob?: number; no_speech_prob?: number }>;
  };
  const segs = j.segments ?? [];
  const avg = (k: "avg_logprob" | "no_speech_prob") =>
    segs.length ? segs.reduce((s, x) => s + (x[k] ?? 0), 0) / segs.length : null;
  return {
    text: (j.text || "").trim(),
    language: j.language ?? null,
    duration: j.duration ?? null,
    avgLogprob: avg("avg_logprob"),
    noSpeechProb: avg("no_speech_prob"),
  };
}

// ---------------- Claude helpers ----------------

async function parse<T extends z.ZodType>(
  purpose: string,
  schema: T,
  system: string,
  user: string,
  effort: "low" | "medium" | "high",
): Promise<z.infer<T> | null> {
  const started = Date.now();
  const res = await client().messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: zodOutputFormat(schema), effort },
  });
  if (res.stop_reason === "refusal") {
    logEvent("ai.claude", null, `${purpose}: model declined, falling back to rules`, { ms: Date.now() - started });
    return null;
  }
  logEvent("ai.claude", null, `${purpose}: ${CLAUDE_MODEL} (${effort}) in ${Date.now() - started} ms`, {
    usage: res.usage,
  });
  return (res.parsed_output ?? null) as z.infer<T> | null;
}

// ---------------- 1. Campaign designer ----------------

export const CampaignDesign = z.object({
  title: z.string().describe("Short campaign title in English, max 60 characters"),
  language_name: z.string().describe("English name of the target language or dialect, e.g. 'Hindi' or 'Bhojpuri'"),
  language_code: z.string().describe("ISO 639-1 code if one exists (e.g. 'hi'), otherwise ISO 639-3"),
  rationale: z
    .string()
    .describe("2-3 sentences for the funder: what the prompts cover and why this data helps the stated use case"),
  suggested_price_cents: z.number().describe("Fair pay per accepted 3-8 second clip in US cents, between 10 and 100"),
  prompts: z
    .array(
      z.object({
        text: z.string().describe("The sentence in the target language, in its native script"),
        gloss: z.string().describe("English translation"),
      }),
    )
    .describe("Recording prompts"),
});
export type CampaignDesign = z.infer<typeof CampaignDesign>;

export async function designCampaign(input: { language: string; brief: string; count: number }): Promise<CampaignDesign> {
  const system = `You design speech-data collection campaigns for MotherTongue, which pays native speakers of under-served languages and dialects (via PayPal) to record short sentences that improve speech AI.
Write prompts that are:
- natural, everyday sentences a real speaker would say, 4-12 words, in the target language's native script (no transliteration)
- focused on the funder's use case, varied in vocabulary, sounds and sentence types (questions, statements, numbers, names of common things)
- free of personal data, brand names, slurs, politics or religion-sensitive content
- easy to read aloud in one breath`;
  const user = `Target language or dialect: ${input.language}
Funder's brief: ${input.brief}
Number of prompts: ${input.count}`;
  const out = await parse("campaign.design", CampaignDesign, system, user, "medium");
  if (!out || out.prompts.length === 0) throw new Error("Could not design the campaign. Please try again.");
  out.prompts = out.prompts.slice(0, input.count);
  out.suggested_price_cents = Math.min(100, Math.max(10, Math.round(out.suggested_price_cents)));
  return out;
}

// ---------------- 2. Clip judge ----------------

export const REASON_CODES = [
  "ok",
  "wrong_language",
  "wrong_sentence",
  "incomplete",
  "silence_or_noise",
  "unclear_speech",
  "other",
] as const;

export const ClipVerdict = z.object({
  verdict: z.enum(["accepted", "rejected", "review"]),
  reasons: z.array(z.enum(REASON_CODES)),
  explanation_local: z
    .string()
    .describe("Max 25 words, warm and specific, written in the speaker's interface language"),
  explanation_en: z.string().describe("Same message in English, max 25 words"),
});
export type ClipVerdict = z.infer<typeof ClipVerdict>;

export async function judgeClip(input: {
  languageName: string;
  expected: string;
  gloss: string | null;
  transcript: string;
  detectedLanguage: string | null;
  durationS: number | null;
  matchScore: number;
  noSpeechProb: number | null;
  avgLogprob: number | null;
  uiLanguage: string;
}): Promise<ClipVerdict | null> {
  const system = `You are the quality reviewer for MotherTongue, a project that pays speakers per verified voice recording. Every accepted clip moves real money, so be fair to the speaker and to the funder.
Decide whether the recording matches the expected sentence in the expected language, using the ASR transcript and signals provided.
- The transcript comes from an automatic speech recognizer. Do not penalize ASR noise: small spelling slips, missing diacritics, a different script for the same words (e.g. Hindi written in Urdu script), digits vs number words, or punctuation.
- "accepted": the speaker clearly said the expected sentence (at least ~85% of it) in the expected language.
- "rejected": a different sentence or language, mostly missing words, silence or noise, or unintelligible speech.
- "review": only when genuinely uncertain (e.g. a heavy dialect that the recognizer garbled, but the length and some words line up).
- explanation_local: speak to the speaker kindly in ${input.uiLanguage}. If rejected, say exactly what to fix.`;
  const user = JSON.stringify(
    {
      expected_language: input.languageName,
      expected_sentence: input.expected,
      expected_meaning_en: input.gloss,
      asr_transcript: input.transcript,
      asr_detected_language: input.detectedLanguage,
      duration_seconds: input.durationS,
      character_similarity_0_to_1: Number(input.matchScore.toFixed(3)),
      asr_no_speech_probability: input.noSpeechProb,
      asr_avg_logprob: input.avgLogprob,
    },
    null,
    1,
  );
  return parse("clip.judge", ClipVerdict, system, user, "low");
}

// ---------------- 3. Settlement reviewer ----------------

export const SettlementNote = z.object({
  summary: z.string().describe("One or two sentences for the funder's ledger describing this payout batch"),
  speaker_note: z.string().describe("A short thank-you note (max 20 words) included in each speaker's PayPal payout"),
});

export async function writeSettlementNote(input: {
  campaignTitle: string;
  languageName: string;
  speakers: number;
  clips: number;
  totalCents: number;
  held: number;
}): Promise<z.infer<typeof SettlementNote> | null> {
  if (!claudeConfigured()) return null;
  try {
    return await parse(
      "settlement.note",
      SettlementNote,
      "You write concise, factual payout notes for MotherTongue, a platform that pays speakers via PayPal for verified voice recordings. No hype, no emojis.",
      JSON.stringify(input),
      "low",
    );
  } catch {
    return null;
  }
}
