/**
 * Clip verification pipeline: deterministic checks -> Whisper -> Qwen3 judge (gpt-oss-20b fallback) -> guardrails.
 * The AI decides; the guardrails make sure money only moves when the signals agree.
 */
import { db, newId, sha256, logEvent, campaignMoney, getCampaign, acceptedAudioMime, looksLikeAudio, storedAudioBytes, MAX_STORED_AUDIO_BYTES, CLIP_COLS, type Campaign, type Prompt, type Contributor, type ClipRow } from "./db";
import { transcribe, judgeClip, llmConfigured } from "./ai";

const PUNCT = /[।॥.,!?;:"'“”‘’()[\]{}\-–—…،؟。，！？]/g;

export function normalize(s: string): string {
  return s.normalize("NFC").toLowerCase().replace(PUNCT, " ").replace(/\s+/g, " ").trim();
}

/** 1 - normalized Levenshtein distance over Unicode code points. */
export function similarity(a: string, b: string): number {
  const x = Array.from(normalize(a));
  const y = Array.from(normalize(b));
  if (!x.length && !y.length) return 1;
  if (!x.length || !y.length) return 0;
  const row = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    let diag = row[0];
    row[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const up = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diag + (x[i - 1] === y[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return 1 - row[y.length] / Math.max(x.length, y.length);
}

export type ClipResult = {
  clip: ClipRow;
  autoSettle: boolean;
};

export class ClipRejected extends Error {}

type ClipInput = {
  campaign: Campaign;
  prompt: Prompt;
  contributor: Contributor;
  audio: Uint8Array;
  mime: string;
};

// uploads currently being judged, keyed contributor:prompt (single Node process)
const gInflight = globalThis as unknown as { __mtClipInflight?: Set<string> };

export async function processClip(input: ClipInput): Promise<ClipResult> {
  const inflight = (gInflight.__mtClipInflight ??= new Set<string>());
  const key = `${input.contributor.id}:${input.prompt.id}`;
  if (inflight.has(key)) throw new ClipRejected("Your last recording for this sentence is still being checked. Please wait a moment.");
  inflight.add(key);
  try {
    return await processClipInner(input);
  } finally {
    inflight.delete(key);
  }
}

async function processClipInner(input: ClipInput): Promise<ClipResult> {
  const { campaign, prompt, contributor, audio } = input;
  const mime = acceptedAudioMime(input.mime);
  if (campaign.status !== "live") throw new ClipRejected("This campaign is not accepting recordings.");
  if (!mime || !looksLikeAudio(audio, mime)) throw new ClipRejected("That file isn't a valid audio recording.");
  if (audio.byteLength < 1500) throw new ClipRejected("That recording was empty. Please try again.");
  if (audio.byteLength > 6_000_000) throw new ClipRejected("That recording is too long. Keep it under 20 seconds.");

  const money = campaignMoney(campaign);
  if (money.clipsLeft <= 0) throw new ClipRejected("This campaign's budget is fully used. Thank you!");

  const d = db();
  const already = d
    .prepare("SELECT id FROM clips WHERE contributor_id = ? AND prompt_id = ? AND verdict = 'accepted'")
    .get(contributor.id, prompt.id);
  if (already) throw new ClipRejected("You already have an accepted recording for this sentence.");

  const hash = sha256(audio);
  const duplicate = d.prepare("SELECT id FROM clips WHERE campaign_id = ? AND sha256 = ?").get(campaign.id, hash);
  if (!duplicate && storedAudioBytes() + audio.byteLength > MAX_STORED_AUDIO_BYTES) {
    throw new ClipRejected("This demo is full of recordings right now. Please try again later.");
  }

  let transcript = "";
  let detected: string | null = null;
  let duration: number | null = null;
  let noSpeech: number | null = null;
  let logprob: number | null = null;
  let verdict: ClipRow["verdict"];
  let reasons: string[];
  let explanation: string;
  let explanationEn: string;
  let judge: string;

  if (duplicate) {
    verdict = "rejected";
    reasons = ["duplicate"];
    explanation = explanationEn = "This exact audio file was already submitted. Please record a fresh take.";
    judge = "rules";
  } else {
    const stt = await transcribe(audio, mime);
    transcript = stt.text;
    detected = stt.language;
    duration = stt.duration;
    noSpeech = stt.noSpeechProb;
    logprob = stt.avgLogprob;
    const match = similarity(transcript, prompt.text);

    let ai: Awaited<ReturnType<typeof judgeClip>> | null = null;
    if (llmConfigured()) {
      try {
        ai = await judgeClip({
          languageName: campaign.language_name,
          expected: prompt.text,
          gloss: prompt.gloss,
          transcript,
          detectedLanguage: detected,
          durationS: duration,
          matchScore: match,
          noSpeechProb: noSpeech,
          avgLogprob: logprob,
          uiLanguage: contributor.ui_language,
        });
      } catch (e) {
        logEvent("ai.llm", campaign.id, `clip judge failed, using rules: ${(e as Error).message.slice(0, 200)}`);
      }
    }

    if (ai) {
      verdict = ai.verdict;
      reasons = ai.reasons;
      explanation = ai.explanation_local;
      explanationEn = ai.explanation_en;
      judge = ai.model;
    } else {
      judge = "rules";
      if (match >= 0.72 && (noSpeech ?? 0) < 0.6) {
        verdict = "accepted";
        reasons = ["ok"];
        explanationEn = explanation = "Clear recording that matches the sentence. Thank you!";
      } else if (match < 0.4) {
        verdict = "rejected";
        reasons = ["wrong_sentence"];
        explanationEn = explanation = "We could not match this recording to the sentence. Please read it again clearly.";
      } else {
        verdict = "review";
        reasons = ["unclear_speech"];
        explanationEn = explanation = "Almost there. Please record it once more, a little more clearly.";
      }
    }

    // ---- Guardrails: money only moves when the evidence agrees ----
    if (!transcript || (duration !== null && duration < 0.6) || (noSpeech ?? 0) > 0.9) {
      if (verdict !== "rejected") {
        reasons = [...reasons, "guardrail:silence"];
        explanationEn = "We could not hear speech in this recording. Please try again closer to the microphone.";
        explanation = explanationEn;
      }
      verdict = "rejected";
    } else if (verdict === "accepted" && match < 0.2) {
      verdict = "review";
      reasons = [...reasons, "guardrail:ai_signal_disagreement"];
    } else if (verdict === "rejected" && match >= 0.93) {
      verdict = "review";
      reasons = [...reasons, "guardrail:protect_speaker"];
    }

    // ---- Re-check right before the INSERT (no await from here to the INSERT, so this is atomic in one process) ----
    const fresh = getCampaign(campaign.id);
    if (!fresh || fresh.status !== "live") throw new ClipRejected("This campaign is not accepting recordings.");
    let storedAudio: Uint8Array = audio;
    if (d.prepare("SELECT id FROM clips WHERE campaign_id = ? AND sha256 = ?").get(campaign.id, hash)) {
      // the same bytes were stored while we were judging this one
      verdict = "rejected";
      reasons = [...reasons, "duplicate"];
      explanation = explanationEn = "This exact audio file was already submitted. Please record a fresh take.";
      storedAudio = new Uint8Array(0);
    } else if (verdict === "accepted") {
      if (d.prepare("SELECT id FROM clips WHERE contributor_id = ? AND prompt_id = ? AND verdict = 'accepted'").get(contributor.id, prompt.id)) {
        throw new ClipRejected("You already have an accepted recording for this sentence.");
      }
      if (campaignMoney(fresh).clipsLeft <= 0) throw new ClipRejected("This campaign's budget is fully used. Thank you!");
    }
    if (storedAudio.byteLength > 0 && storedAudioBytes() + storedAudio.byteLength > MAX_STORED_AUDIO_BYTES) {
      throw new ClipRejected("This demo is full of recordings right now. Please try again later.");
    }

    logEvent("ai.judge", campaign.id, `${verdict.toUpperCase()} clip for "${prompt.text.slice(0, 40)}" (similarity ${match.toFixed(2)}, ${judge})`, {
      transcript,
      detected,
      match,
      reasons,
    });

    const id = newId("clip");
    d.prepare(
      `INSERT INTO clips (id, campaign_id, prompt_id, contributor_id, audio, mime, bytes, sha256, duration_s, transcript, detected_language, match_score, no_speech_prob, avg_logprob, verdict, reasons, explanation, explanation_en, judge, price_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      campaign.id,
      prompt.id,
      contributor.id,
      storedAudio,
      mime,
      audio.byteLength,
      hash,
      duration,
      transcript,
      detected,
      match,
      noSpeech,
      logprob,
      verdict,
      JSON.stringify(reasons),
      explanation,
      explanationEn,
      judge,
      verdict === "accepted" ? campaign.price_cents : 0,
    );
    return { clip: getClip(id)!, autoSettle: verdict === "accepted" };
  }

  // duplicate path: store metadata for audit (no audio bytes, so repeats can't fill the disk), no AI spend
  const id = newId("clip");
  d.prepare(
    `INSERT INTO clips (id, campaign_id, prompt_id, contributor_id, audio, mime, bytes, sha256, verdict, reasons, explanation, explanation_en, judge, price_cents)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
  ).run(id, campaign.id, prompt.id, contributor.id, new Uint8Array(0), mime, audio.byteLength, hash, verdict, JSON.stringify(reasons), explanation, explanationEn, judge);
  logEvent("ai.judge", campaign.id, "REJECTED duplicate audio (no AI call needed)");
  return { clip: getClip(id)!, autoSettle: false };
}

export function getClip(id: string): ClipRow | undefined {
  return db().prepare(`SELECT ${CLIP_COLS} FROM clips WHERE id = ?`).get(id) as ClipRow | undefined;
}
