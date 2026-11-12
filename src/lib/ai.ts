/**
 * AI layer, all on Groq (one API key):
 *  - Speech-to-text + language ID ......... whisper-large-v3-turbo
 *  - Campaign designer + settlement agent .. openai/gpt-oss-120b  (strict JSON-schema outputs, reasoning)
 *  - Clip judge (multilingual feedback) .... qwen/qwen3.8-27b     (fast, 100+ languages)
 *    fallback judge ........................ openai/gpt-oss-20b
 * Every structured output is validated with zod before the app acts on it.
 */
import { z } from "zod";
import { logEvent } from "./db";

const GROQ = "https://api.groq.com/openai/v1";
export const STT_MODEL = process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo";
export const DESIGN_MODEL = process.env.GROQ_DESIGN_MODEL || "openai/gpt-oss-120b";
export const JUDGE_MODEL = process.env.GROQ_JUDGE_MODEL || "qwen/qwen3.8-27b";
export const FALLBACK_JUDGE_MODEL = process.env.GROQ_FALLBACK_JUDGE_MODEL || "openai/gpt-oss-20b";

export function llmConfigured() {
  return Boolean(process.env.GROQ_API_KEY);
}
export const sttConfigured = llmConfigured;

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
  const started = Date.now();
  const res = await fetch(`${GROQ}/audio/transcriptions`, {
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
  logEvent("ai.stt", null, `${STT_MODEL}: ${j.language ?? "?"} · ${(j.duration ?? 0).toFixed(1)}s audio in ${Date.now() - started} ms`);
  return {
    text: (j.text || "").trim(),
    language: j.language ?? null,
    duration: j.duration ?? null,
    avgLogprob: avg("avg_logprob"),
    noSpeechProb: avg("no_speech_prob"),
  };
}

// ---------------- Groq structured-output helper ----------------

/** zod -> JSON Schema suitable for strict structured outputs (every object closed, every key required). */
function toStrictSchema(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema) as Record<string, unknown>;
  delete js.$schema;
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    if (n.type === "object" && n.properties && typeof n.properties === "object") {
      n.additionalProperties = false;
      n.required = Object.keys(n.properties as object);
      Object.values(n.properties as object).forEach(walk);
    }
    if (n.items) walk(n.items);
    for (const k of ["anyOf", "oneOf", "allOf"]) if (Array.isArray(n[k])) (n[k] as unknown[]).forEach(walk);
  };
  walk(js);
  return js;
}

type ChatOpts = {
  model: string;
  strict: boolean;
  reasoningEffort?: "low" | "medium" | "high";
  maxTokens?: number;
  /** repair common model deviations (casing, synonyms) before schema validation */
  normalize?: (raw: Record<string, unknown>) => Record<string, unknown>;
};

async function groqJSON<T extends z.ZodType>(purpose: string, schema: T, system: string, user: string, opts: ChatOpts): Promise<z.infer<T>> {
  if (!llmConfigured()) throw new Error("AI is not configured: set GROQ_API_KEY");
  const body: Record<string, unknown> = {
    model: opts.model,
    temperature: 0.3,
    max_completion_tokens: opts.maxTokens ?? 4000,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: purpose.replace(/[^a-z0-9_]/gi, "_"), schema: toStrictSchema(schema), strict: opts.strict },
    },
  };
  if (opts.reasoningEffort && opts.model.startsWith("openai/gpt-oss")) body.reasoning_effort = opts.reasoningEffort;

  const started = Date.now();
  const res = await fetch(`${GROQ}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${opts.model} ${purpose} failed (${res.status}): ${text.slice(0, 300)}`);
  const j = JSON.parse(text) as { choices: Array<{ message: { content: string } }>; usage?: Record<string, number> };
  const raw = j.choices?.[0]?.message?.content ?? "";
  let obj = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")) as Record<string, unknown>;
  if (opts.normalize) obj = opts.normalize(obj);
  const parsed = schema.safeParse(obj);
  if (!parsed.success) throw new Error(`${opts.model} ${purpose} returned invalid JSON: ${parsed.error.message.slice(0, 200)}`);
  logEvent("ai.llm", null, `${purpose}: ${opts.model} in ${Date.now() - started} ms`, { usage: j.usage });
  return parsed.data;
}

// ---------------- 1. Campaign designer (gpt-oss-120b) ----------------

export const CampaignDesign = z.object({
  title: z.string().describe("Short campaign title in English, max 60 characters"),
  language_name: z.string().describe("English name of the target language or dialect, e.g. 'Hindi' or 'Bhojpuri'"),
  language_code: z.string().describe("ISO 639-1 code if one exists (e.g. 'hi'), otherwise ISO 639-3"),
  rationale: z.string().describe("2-3 sentences for the funder: what the prompts cover and why this data helps the stated use case"),
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
- natural, everyday sentences a real speaker would say, 4-12 words, in the target language's native script (never transliterated into Latin script unless the language is normally written that way)
- focused on the funder's use case, varied in vocabulary, sounds and sentence types (questions, statements, numbers, common objects)
- free of personal data, brand names, slurs, politics or religion-sensitive content
- easy to read aloud in one breath
Return exactly the requested number of prompts.`;
  const user = `Target language or dialect: ${input.language}
Funder's brief: ${input.brief}
Number of prompts: ${input.count}`;
  const out = await groqJSON("campaign_design", CampaignDesign, system, user, {
    model: DESIGN_MODEL,
    strict: true,
    reasoningEffort: "medium",
    maxTokens: 8000,
  });
  if (out.prompts.length === 0) throw new Error("Could not design the campaign. Please try again.");
  out.prompts = out.prompts.filter((p) => p.text.trim()).slice(0, input.count);
  out.suggested_price_cents = Math.min(100, Math.max(10, Math.round(out.suggested_price_cents)));
  out.title = out.title.slice(0, 80);
  return out;
}

// ---------------- 2. Clip judge (qwen3.8-27b, fallback gpt-oss-20b) ----------------

export const REASON_CODES = ["ok", "wrong_language", "wrong_sentence", "incomplete", "silence_or_noise", "unclear_speech", "other"] as const;

export const ClipVerdict = z.object({
  verdict: z.enum(["accepted", "rejected", "review"]),
  reasons: z.array(z.enum(REASON_CODES)),
  explanation_local: z.string().describe("Max 25 words, warm and specific, written in the speaker's interface language"),
  explanation_en: z.string().describe("Same message in English, max 25 words"),
});
export type ClipVerdict = z.infer<typeof ClipVerdict> & { model: string };

/** Qwen (non-strict JSON mode) sometimes returns "Rejected", "reject", "needs_review" or free-text reasons. */
function normalizeVerdict(raw: Record<string, unknown>): Record<string, unknown> {
  const v = String(raw.verdict ?? raw.decision ?? "").toLowerCase().trim();
  const verdict = v.startsWith("accept") || v === "pass" ? "accepted" : v.startsWith("reject") || v === "fail" ? "rejected" : v.includes("review") || v.includes("uncertain") ? "review" : v;
  const codes = REASON_CODES as readonly string[];
  const reasons = (Array.isArray(raw.reasons) ? raw.reasons : raw.reason ? [raw.reason] : [])
    .map((r) => String(r).toLowerCase().trim().replace(/[\s-]+/g, "_"))
    .map((r) => (codes.includes(r) ? r : "other"));
  const local = String(raw.explanation_local ?? raw.explanation ?? "");
  return { verdict, reasons: reasons.length ? reasons : [verdict === "accepted" ? "ok" : "other"], explanation_local: local, explanation_en: String(raw.explanation_en ?? local) };
}

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
}): Promise<ClipVerdict> {
  const system = `You are the quality reviewer for MotherTongue, which pays speakers per verified voice recording. Every accepted clip moves real money, so be fair to the speaker and to the funder.
Decide whether the recording matches the expected sentence in the expected language, using the speech-recognizer (ASR) transcript and signals provided.
- Do not penalize ASR noise: small spelling slips, missing diacritics or nukta, chandrabindu vs anusvara, a different script for the same words (e.g. Hindi written in Urdu script), digits vs number words, punctuation.
- "accepted": the speaker clearly said the expected sentence (at least ~85% of it) in the expected language.
- "rejected": a different sentence or language, mostly missing words, silence or noise, or unintelligible speech.
- "review": only when genuinely uncertain (e.g. heavy dialect the recognizer garbled while length and some words line up).
- reasons: one or more codes; use "ok" alone when accepted.
- explanation_local: speak to the speaker kindly, in ${input.uiLanguage}. If rejected, say exactly what to fix. explanation_en: the same in English.
Respond with JSON only.`;
  const user = JSON.stringify({
    expected_language: input.languageName,
    expected_sentence: input.expected,
    expected_meaning_en: input.gloss,
    asr_transcript: input.transcript,
    asr_detected_language: input.detectedLanguage,
    duration_seconds: input.durationS,
    character_similarity_0_to_1: Number(input.matchScore.toFixed(3)),
    asr_no_speech_probability: input.noSpeechProb,
    asr_avg_logprob: input.avgLogprob,
  });
  try {
    const v = await groqJSON("clip_judge", ClipVerdict, system, user, { model: JUDGE_MODEL, strict: false, maxTokens: 1200, normalize: normalizeVerdict });
    return { ...v, model: JUDGE_MODEL };
  } catch (e) {
    logEvent("ai.llm", null, `clip_judge: ${JUDGE_MODEL} failed, falling back to ${FALLBACK_JUDGE_MODEL}: ${(e as Error).message.slice(0, 160)}`);
    const v = await groqJSON("clip_judge", ClipVerdict, system, user, {
      model: FALLBACK_JUDGE_MODEL,
      strict: true,
      reasoningEffort: "low",
      maxTokens: 2000,
      normalize: normalizeVerdict,
    });
    return { ...v, model: FALLBACK_JUDGE_MODEL };
  }
}

// ---------------- 3. Settlement agent note (gpt-oss-120b) ----------------

export const SettlementNote = z.object({
  summary: z.string().describe("One or two factual sentences for the funder's ledger describing this payout batch"),
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
  if (!llmConfigured()) return null;
  try {
    return await groqJSON(
      "settlement_note",
      SettlementNote,
      "You write concise, factual payout notes for MotherTongue, a platform that pays speakers via PayPal for verified voice recordings. Amounts are in US dollars (totalCents is cents). No hype, no emojis.",
      JSON.stringify(input),
      { model: DESIGN_MODEL, strict: true, reasoningEffort: "low", maxTokens: 1500 },
    );
  } catch (e) {
    logEvent("ai.llm", null, `settlement_note failed: ${(e as Error).message.slice(0, 160)}`);
    return null;
  }
}
