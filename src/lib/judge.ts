/**
 * Clip verification pipeline: deterministic checks -> Whisper -> Claude judge -> guardrails.
 * The AI decides; the guardrails make sure money only moves when the signals agree.
 */
import { db, newId, sha256, logEvent, campaignMoney, CLIP_COLS, type Campaign, type Prompt, type Contributor, type ClipRow } from "./db";
import { transcribe, judgeClip, claudeConfigured, CLAUDE_MODEL } from "./ai";

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

export async function processClip(input: {
  campaign: Campaign;
  prompt: Prompt;
  contributor: Contributor;
  audio: Uint8Array;
  mime: string;
}): Promise<ClipResult> {
  const { campaign, prompt, contributor, audio, mime } = input;
  if (campaign.status !== "live") throw new ClipRejected("This campaign is not accepting recordings.");
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

    let ai = null;
    if (claudeConfigured()) {
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
        logEvent("ai.claude", campaign.id, `clip.judge failed, using rules: ${(e as Error).message.slice(0, 200)}`);
      }
    }

    if (ai) {
      verdict = ai.verdict;
      reasons = ai.reasons;
      explanation = ai.explanation_local;
      explanationEn = ai.explanation_en;
      judge = CLAUDE_MODEL;
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
        explanationEn = explanation = "Almost there. A reviewer will check this one.";
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
      audio,
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

  // duplicate path: store for audit, no AI spend
  const id = newId("clip");
  d.prepare(
    `INSERT INTO clips (id, campaign_id, prompt_id, contributor_id, audio, mime, bytes, sha256, verdict, reasons, explanation, explanation_en, judge, price_cents)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
  ).run(id, campaign.id, prompt.id, contributor.id, audio, mime, audio.byteLength, hash, verdict, JSON.stringify(reasons), explanation, explanationEn, judge);
  logEvent("ai.judge", campaign.id, "REJECTED duplicate audio (no AI call needed)");
  return { clip: getClip(id)!, autoSettle: false };
}

export function getClip(id: string): ClipRow | undefined {
  return db().prepare(`SELECT ${CLIP_COLS} FROM clips WHERE id = ?`).get(id) as ClipRow | undefined;
}
