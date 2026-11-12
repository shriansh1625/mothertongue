"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const UI_LANGS = ["English", "Hindi", "Tagalog", "Swahili", "Bengali", "Tamil", "Spanish", "Indonesian", "Yoruba", "Urdu"];

export function JoinForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [uiLanguage, setUiLanguage] = useState("English");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="card p-6 mt-8 space-y-4 max-w-xl"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch("/api/contributors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, uiLanguage, consent }),
        });
        const j = await res.json();
        if (!res.ok) {
          setError(j.error);
          setBusy(false);
          return;
        }
        router.refresh();
      }}
    >
      <p className="font-display text-xl font-semibold">Join as a speaker</p>
      <label className="block space-y-1.5">
        <span className="label">Name shown to funders</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Asha" required />
      </label>
      <label className="block space-y-1.5">
        <span className="label">PayPal email (where you get paid)</span>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
        <span className="text-xs text-muted">Sandbox demo: use a PayPal sandbox personal account email.</span>
      </label>
      <label className="block space-y-1.5">
        <span className="label">Language for AI feedback</span>
        <select className="input" value={uiLanguage} onChange={(e) => setUiLanguage(e.target.value)}>
          {UI_LANGS.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </label>
      <label className="flex gap-3 text-sm text-muted">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
        <span>
          I consent to my recordings being used to train and evaluate speech AI for this campaign&apos;s stated purpose. My name and email
          are never included in the dataset, only a pseudonym.
        </span>
      </label>
      {error && <p className="text-sm text-bad">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>
        {busy ? "Joining…" : "Start recording →"}
      </button>
    </form>
  );
}
