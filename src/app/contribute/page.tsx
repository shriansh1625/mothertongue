import Link from "next/link";
import { db, usd, campaignMoney, type Campaign } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function ContributePage() {
  const live = db().prepare("SELECT * FROM campaigns WHERE status = 'live' ORDER BY created_at DESC").all() as Campaign[];
  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <p className="label text-accent">For speakers</p>
      <h1 className="font-display text-4xl font-semibold mt-2">Record &amp; earn</h1>
      <p className="text-muted mt-3 max-w-2xl">
        Pick a language you speak natively and read short sentences aloud. Each recording is checked by AI within seconds. Verified clips
        are paid to your PayPal account, and you see exactly why any clip was not accepted.
      </p>
      {live.length === 0 ? (
        <div className="card p-8 mt-8 text-muted">No open campaigns right now. Check back soon.</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4 mt-8">
          {live.map((c) => {
            const m = campaignMoney(c);
            return (
              <Link key={c.id} href={`/contribute/${c.id}`} className="card p-6 hover:-translate-y-0.5 transition">
                <div className="flex items-center justify-between">
                  <span className="pill bg-paper-2 border-line">{c.language_name}</span>
                  <span className="pill bg-ok/10 text-ok">{usd(c.price_cents)} / verified clip</span>
                </div>
                <p className="font-display text-2xl font-semibold mt-3">{c.title}</p>
                <p className="text-sm text-muted mt-2">{c.brief}</p>
                <p className="text-sm mt-4">
                  <span className="font-semibold">{m.clipsLeft}</span> <span className="text-muted">clips left · funded by {c.funder_name}</span>
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
