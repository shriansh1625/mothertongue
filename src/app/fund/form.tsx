"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const EXAMPLES = [
  {
    language: "Hindi (rural UP accent)",
    brief: "Patient phrases for a clinic voice assistant in rural Uttar Pradesh: symptoms, medicine timing, appointments, family members.",
  },
  {
    language: "Tagalog",
    brief: "Everyday banking and mobile-payment phrases for a voice assistant used by first-time smartphone users in the Philippines.",
  },
  {
    language: "Swahili",
    brief: "Farm and weather vocabulary for a voice helpline that gives smallholder farmers planting advice.",
  },
];

export function CreateCampaignForm() {
  const router = useRouter();
  const [funderName, setFunderName] = useState("");
  const [language, setLanguage] = useState(EXAMPLES[0].language);
  const [brief, setBrief] = useState(EXAMPLES[0].brief);
  const [count, setCount] = useState(12);
  const [price, setPrice] = useState("0.25");
  const [budget, setBudget] = useState("20.00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceCents = Math.round(parseFloat(price || "0") * 100);
  const budgetCents = Math.round(parseFloat(budget || "0") * 100);
  const costPerClip = Math.round(priceCents * 1.1);
  const maxClips = costPerClip > 0 ? Math.floor(budgetCents / costPerClip) : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ funderName, language, brief, count, priceCents, budgetCents }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Something went wrong");
      router.push(`/campaigns/${j.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-6 mt-8 space-y-5">
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            type="button"
            key={ex.language}
            onClick={() => {
              setLanguage(ex.language);
              setBrief(ex.brief);
            }}
            className={`pill border-line ${language === ex.language ? "bg-ink text-paper" : "bg-paper-2 text-ink"}`}
          >
            {ex.language}
          </button>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="space-y-1.5 block">
          <span className="label">Your organisation</span>
          <input className="input" value={funderName} onChange={(e) => setFunderName(e.target.value)} placeholder="e.g. Sehat Voice Clinic" required />
        </label>
        <label className="space-y-1.5 block">
          <span className="label">Language or dialect</span>
          <input className="input" value={language} onChange={(e) => setLanguage(e.target.value)} required />
        </label>
      </div>
      <label className="space-y-1.5 block">
        <span className="label">What is the data for?</span>
        <textarea className="input min-h-24" value={brief} onChange={(e) => setBrief(e.target.value)} required />
      </label>
      <div className="grid sm:grid-cols-3 gap-4">
        <label className="space-y-1.5 block">
          <span className="label">Sentences</span>
          <input className="input" type="number" min={4} max={30} value={count} onChange={(e) => setCount(Number(e.target.value))} />
        </label>
        <label className="space-y-1.5 block">
          <span className="label">Pay per clip (USD)</span>
          <input className="input" type="number" step="0.05" min="0.05" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className="space-y-1.5 block">
          <span className="label">Budget (USD)</span>
          <input className="input" type="number" step="1" min="1" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </label>
      </div>
      <p className="text-sm text-muted">
        Each verified clip costs {`$${(costPerClip / 100).toFixed(2)}`}: the speaker&apos;s pay plus a 10% platform fee. This budget covers up to{" "}
        <strong className="text-ink">{maxClips} verified clips</strong>. Anything unused is refunded via PayPal when you close the campaign.
      </p>
      {error && <p className="text-sm text-bad">{error}</p>}
      <button className="btn btn-primary w-full sm:w-auto" disabled={busy}>
        {busy ? "Claude is writing your prompts…" : "Design campaign with AI →"}
      </button>
    </form>
  );
}
