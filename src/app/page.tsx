import Link from "next/link";
import { db, usd, campaignMoney, type Campaign } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function Home() {
  const d = db();
  const stats = d
    .prepare(
      `SELECT
        (SELECT COUNT(DISTINCT language_code) FROM campaigns WHERE status != 'draft') AS languages,
        (SELECT COUNT(*) FROM clips WHERE verdict = 'accepted') AS verified,
        (SELECT COUNT(*) FROM clips) AS reviewed,
        (SELECT COUNT(DISTINCT contributor_id) FROM clips WHERE payout_status = 'paid') AS paidSpeakers,
        (SELECT COALESCE(SUM(price_cents),0) FROM clips WHERE payout_status = 'paid') AS paidCents`,
    )
    .get() as { languages: number; verified: number; reviewed: number; paidSpeakers: number; paidCents: number };
  const live = d.prepare("SELECT * FROM campaigns WHERE status = 'live' ORDER BY created_at DESC LIMIT 6").all() as Campaign[];

  return (
    <div>
      <section className="mx-auto max-w-6xl px-5 pt-16 pb-12 grid lg:grid-cols-[1.15fr_0.85fr] gap-12 items-center">
        <div className="rise">
          <p className="label text-accent">Speech data, paid fairly · PayPal + AI</p>
          <h1 className="font-display text-5xl sm:text-6xl font-semibold leading-[1.02] mt-4">
            Get paid to teach AI <span className="text-accent italic">your</span> language.
          </h1>
          <p className="mt-6 text-lg text-muted max-w-xl">
            Voice AI still fails billions of people because their languages and accents have almost no recorded speech. MotherTongue
            lets anyone fund that data and pays speakers anywhere through <strong className="text-ink">PayPal</strong>. AI checks
            every recording first, so funders pay only for verified clips.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/contribute" className="btn btn-accent">
              Record &amp; earn →
            </Link>
            <Link href="/fund" className="btn btn-ghost">
              Fund a language
            </Link>
          </div>
        </div>
        <div className="card p-6 rise" style={{ animationDelay: "80ms" }}>
          <p className="label">Live on this server</p>
          <div className="grid grid-cols-2 gap-5 mt-4">
            <Stat value={String(stats.languages)} label="languages funded" />
            <Stat value={`${stats.verified}/${stats.reviewed}`} label="clips verified / reviewed" />
            <Stat value={String(stats.paidSpeakers)} label="speakers paid" />
            <Stat value={usd(stats.paidCents)} label="paid via PayPal Payouts" accent />
          </div>
          <div className="mt-6 rounded-xl bg-paper-2 p-4 text-sm text-muted">
            <p className="script text-ink text-lg">“मेरे गाँव में डॉक्टर हफ़्ते में एक बार आते हैं।”</p>
            <p className="mt-1">“The doctor visits my village once a week.” Real sentences like this train clinic voice assistants.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-8">
        <div className="grid md:grid-cols-4 gap-4">
          {[
            ["1 · Fund", "A health NGO, university or AI lab describes the speech it needs. GPT-OSS 120B writes native-script sentences, and the budget is paid with PayPal Checkout."],
            ["2 · Record", "Native speakers read sentences aloud in the browser, from anywhere, in minutes."],
            ["3 · Verify", "Whisper transcribes each clip, and Qwen3 judges it against the sentence. Guardrails stop money moving when the signals disagree."],
            ["4 · Pay & refund", "The settlement agent pays speakers in batches via PayPal Payouts. When the campaign closes, the unused budget is refunded through PayPal automatically."],
          ].map(([t, b]) => (
            <div key={t} className="card p-5">
              <p className="font-display text-lg font-semibold">{t}</p>
              <p className="text-sm text-muted mt-2">{b}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-8">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-3xl font-semibold">Open campaigns</h2>
          <Link href="/contribute" className="text-sm font-semibold text-accent">
            See all →
          </Link>
        </div>
        {live.length === 0 ? (
          <div className="card p-8 mt-5 text-muted">
            No live campaigns yet. <Link href="/fund" className="text-accent font-semibold">Fund the first one →</Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-4 mt-5">
            {live.map((c) => {
              const m = campaignMoney(c);
              return (
                <Link key={c.id} href={`/contribute/${c.id}`} className="card p-5 hover:-translate-y-0.5 transition">
                  <p className="label">{c.language_name}</p>
                  <p className="font-display text-xl font-semibold mt-1">{c.title}</p>
                  <p className="text-sm text-muted mt-2 line-clamp-2">{c.brief}</p>
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="pill bg-ok/10 text-ok">{usd(c.price_cents)} per clip</span>
                    <span className="text-muted">{m.clipsLeft} clips left</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div>
      <p className={`font-display text-3xl font-semibold ${accent ? "text-accent" : ""}`}>{value}</p>
      <p className="text-xs text-muted mt-1">{label}</p>
    </div>
  );
}
