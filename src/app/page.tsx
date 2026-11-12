import Link from "next/link";
import type { ReactNode } from "react";
import { db, usd, campaignMoney, type Campaign } from "@/lib/db";
import { BlurText, Lift, Marquee, NumberTicker, ProgressBar, Reveal, RotatingWords, SpotlightCard } from "@/components/motion/primitives";
import { BlobScene, BlurryGradient, LayeredWaves } from "@/components/backgrounds";
import { HeroDemo } from "@/components/home/hero-demo";

export const dynamic = "force-dynamic";

const HERO_LANGS = ["हिन्दी", "Tagalog", "Kiswahili", "Yorùbá", "தமிழ்", "Bhojpuri", "বাংলা", "Hausa"];

const GREETINGS: [string, string][] = [
  ["नमस्ते", "Hindi"],
  ["Kumusta", "Tagalog"],
  ["Habari", "Swahili"],
  ["Báwo ni", "Yorùbá"],
  ["வணக்கம்", "Tamil"],
  ["নমস্কার", "Bengali"],
  ["Sannu", "Hausa"],
  ["ሰላም", "Amharic"],
  ["నమస్కారం", "Telugu"],
  ["Sawubona", "Zulu"],
  ["ਸਤ ਸ੍ਰੀ ਅਕਾਲ", "Punjabi"],
  ["Ndewo", "Igbo"],
  ["પ્રણામ", "Gujarati"],
  ["Allillanchu", "Quechua"],
  ["ನಮಸ್ಕಾರ", "Kannada"],
  ["မင်္ဂလာပါ", "Burmese"],
];

const LANGUAGE_NAMES = [
  "हिन्दी",
  "Kiswahili",
  "தமிழ்",
  "Tagalog",
  "বাংলা",
  "Yorùbá",
  "తెలుగు",
  "भोजपुरी",
  "ગુજરાતી",
  "Hausa",
  "ਪੰਜਾਬੀ",
  "isiZulu",
  "मराठी",
  "አማርኛ",
  "ಕನ್ನಡ",
  "Igbo",
  "മലയാളം",
  "Runasimi",
  "ଓଡ଼ିଆ",
  "ខ្មែរ",
];

type Badge = { text: string; kind: "paypal" | "ai" };

const STEPS: { n: string; title: string; body: string; badges: Badge[]; icon: ReactNode; span: string; extra?: ReactNode }[] = [
  {
    n: "01",
    title: "Fund",
    body: "A health NGO, university or AI lab describes the speech it needs. GPT-OSS 120B writes native-script sentences, and the budget is paid with PayPal Checkout.",
    badges: [
      { text: "PayPal Checkout", kind: "paypal" },
      { text: "GPT-OSS 120B", kind: "ai" },
    ],
    icon: <IconWallet />,
    span: "md:col-span-4",
    extra: (
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-line/80 bg-paper-2/60 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Funder brief</p>
          <p className="mt-0.5 text-sm text-ink">“Symptom phrases for a rural clinic voice assistant.”</p>
        </div>
        <div className="rounded-xl border border-line/80 bg-paper-2/60 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">AI-designed prompt</p>
          <p lang="hi" className="script text-sm text-ink">
            मुझे दो दिन से बुखार है।
          </p>
          <p className="text-xs text-muted">“I have had a fever for two days.”</p>
        </div>
      </div>
    ),
  },
  {
    n: "02",
    title: "Record",
    body: "Native speakers read sentences aloud in the browser, from anywhere, in minutes.",
    badges: [{ text: "Paid via PayPal", kind: "paypal" }],
    icon: <IconMic />,
    span: "md:col-span-2",
  },
  {
    n: "03",
    title: "Verify",
    body: "Whisper transcribes each clip and identifies the language, and Qwen3 judges it against the sentence. Guardrails stop money moving when the signals disagree.",
    badges: [
      { text: "Whisper", kind: "ai" },
      { text: "Qwen3", kind: "ai" },
    ],
    icon: <IconShield />,
    span: "md:col-span-2",
  },
  {
    n: "04",
    title: "Pay & refund",
    body: "The settlement agent pays speakers in batches via PayPal Payouts. When the campaign closes, the unused budget is refunded through PayPal automatically.",
    badges: [
      { text: "PayPal Payouts", kind: "paypal" },
      { text: "PayPal refunds", kind: "paypal" },
      { text: "GPT-OSS 120B notes", kind: "ai" },
    ],
    icon: <IconSend />,
    span: "md:col-span-4",
    extra: (
      <div className="mt-5 flex flex-wrap items-center gap-2 text-xs font-medium">
        <span className="rounded-full border border-line bg-paper-2/70 px-3 py-1.5 text-ink">Verified clips</span>
        <Arrow />
        <span className="rounded-full border border-ppblue/20 bg-ppblue/5 px-3 py-1.5 text-ppblue">One Payouts batch</span>
        <Arrow />
        <span className="rounded-full border border-line bg-paper-2/70 px-3 py-1.5 text-ink">Speakers&apos; PayPal accounts</span>
        <span className="basis-full sm:basis-auto sm:ml-2 text-muted">+ unused budget refunded to the funder</span>
      </div>
    ),
  },
];

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
    <div className="overflow-x-clip">
      {/* ---------------- Hero ---------------- */}
      <section className="relative isolate">
        <BlurryGradient />
        <div
          aria-hidden
          className="dot-grid pointer-events-none absolute inset-0 opacity-70"
          style={{ maskImage: "radial-gradient(ellipse 70% 60% at 50% 35%, #000 30%, transparent 75%)", WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 35%, #000 30%, transparent 75%)" }}
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pt-14 pb-16 sm:pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14 lg:pb-24">
          <div>
            <Reveal y={10}>
              <p className="inline-flex items-center gap-2 rounded-full border border-line bg-[#fffdf9]/80 px-3 py-1 text-xs font-semibold text-muted shadow-sm backdrop-blur">
                <span className="size-1.5 rounded-full bg-accent" aria-hidden />
                Speech data, paid fairly · PayPal + AI
              </p>
            </Reveal>
            <h1 className="mt-5 font-display text-[2.6rem] font-semibold leading-[1.05] sm:text-6xl lg:text-[4.1rem]">
              <span className="sr-only">Get paid to teach AI in your language.</span>
              {[
                ["Get", "paid", "to"],
                ["teach", "AI"],
              ].map((line, li) => (
                <span key={li} aria-hidden className="block">
                  {line.map((w, i) => (
                    <span key={w}>
                      <BlurText text={w} delay={(li * 3 + i) * 0.07} />{" "}
                    </span>
                  ))}
                </span>
              ))}
              <span aria-hidden className="mt-1 flex flex-wrap items-baseline gap-x-3 text-accent">
                <span className="italic">in</span>
                <RotatingWords words={HERO_LANGS} interval={2300} className="py-1 leading-[1.25]" />
              </span>
            </h1>
            <Reveal delay={0.35}>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
                Voice AI still fails billions of people because their languages and accents have almost no recorded speech. MotherTongue
                lets anyone fund that data and pays speakers anywhere through <strong className="text-ink">PayPal</strong>. AI checks
                every recording first, so funders pay only for verified clips.
              </p>
            </Reveal>
            <Reveal delay={0.45}>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/contribute" className="btn btn-accent shimmer group">
                  Record &amp; earn
                  <span aria-hidden className="inline-block transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </Link>
                <Link href="/fund" className="btn btn-ghost">
                  Fund a language
                </Link>
              </div>
            </Reveal>
            <Reveal delay={0.55}>
              <ul className="mt-8 flex flex-wrap gap-2" aria-label="Built on">
                {["PayPal Checkout", "PayPal Payouts", "Auto refunds", "Signed webhooks"].map((t) => (
                  <li key={t}>
                    <Chip kind="paypal">{t}</Chip>
                  </li>
                ))}
                {["Whisper", "GPT-OSS 120B", "Qwen3"].map((t) => (
                  <li key={t}>
                    <Chip kind="ai">{t}</Chip>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
          <Reveal delay={0.2} y={24} className="mx-auto w-full max-w-md lg:max-w-none">
            <HeroDemo />
          </Reveal>
        </div>
      </section>

      {/* ---------------- Language marquee ---------------- */}
      <section aria-labelledby="langs-heading" className="border-y border-line/70 bg-paper-2/40 py-8">
        <h2 id="langs-heading" className="label mb-5 text-center">
          Built for the languages voice AI forgets
        </h2>
        <Marquee duration={55}>
          {GREETINGS.map(([g, l]) => (
            <span key={l} className="inline-flex items-baseline gap-2 rounded-full border border-line bg-[#fffdf9] px-4 py-2 shadow-sm">
              <span className="script text-lg text-ink">{g}</span>
              <span className="text-xs text-muted">{l}</span>
            </span>
          ))}
        </Marquee>
        <Marquee reverse duration={65} className="mt-3">
          {LANGUAGE_NAMES.map((n) => (
            <span key={n} className="script px-3 text-2xl text-muted/80">
              {n}
              <span aria-hidden className="ml-6 text-accent/50">
                ·
              </span>
            </span>
          ))}
        </Marquee>
      </section>

      {/* ---------------- Live stats ---------------- */}
      <section className="mx-auto max-w-6xl px-5 pt-16" aria-labelledby="stats-heading">
        <Reveal>
          <div className="card grid gap-0 overflow-hidden lg:grid-cols-[1.4fr_1fr]">
            <div className="p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="stats-heading" className="label flex items-center gap-2">
                  <span className="relative flex size-2" aria-hidden>
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok/60 motion-reduce:hidden" />
                    <span className="relative inline-flex size-2 rounded-full bg-ok" />
                  </span>
                  Live on this server
                </h2>
                <span className="text-xs text-muted">Straight from the database · PayPal sandbox</span>
              </div>
              <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-4">
                <Stat label="languages funded" sr={String(stats.languages)}>
                  <NumberTicker value={stats.languages} />
                </Stat>
                <Stat label="clips verified / reviewed" sr={`${stats.verified} of ${stats.reviewed}`}>
                  <NumberTicker value={stats.verified} />
                  <span className="text-muted/60">/</span>
                  <NumberTicker value={stats.reviewed} />
                </Stat>
                <Stat label="speakers paid" sr={String(stats.paidSpeakers)}>
                  <NumberTicker value={stats.paidSpeakers} />
                </Stat>
                <Stat label="paid via PayPal Payouts" sr={usd(stats.paidCents)} accent>
                  <NumberTicker value={stats.paidCents / 100} decimals={2} prefix="$" />
                </Stat>
              </dl>
            </div>
            <div className="relative border-t border-line bg-paper-2/60 p-6 sm:p-8 lg:border-t-0 lg:border-l">
              <p className="label">Why it matters</p>
              <p lang="hi" className="script mt-3 text-xl text-ink">
                “मेरे गाँव में डॉक्टर हफ़्ते में एक बार आते हैं।”
              </p>
              <p className="mt-2 text-sm text-muted">“The doctor visits my village once a week.” Real sentences like this train clinic voice assistants.</p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section className="mx-auto max-w-6xl px-5 pt-24" aria-labelledby="how-heading">
        <Reveal className="max-w-2xl">
          <p className="label text-accent">How it works</p>
          <h2 id="how-heading" className="mt-3 font-display text-3xl font-semibold leading-tight sm:text-4xl">
            From a funder&apos;s brief to a speaker&apos;s PayPal balance.
          </h2>
          <p className="mt-3 text-muted">AI does the checking that makes tiny payments viable. PayPal moves the money in, out and back.</p>
        </Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-6">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.08} className={`${s.span} h-full`}>
              <SpotlightCard className="h-full p-6 sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-11 place-items-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">{s.icon}</span>
                  <span className="font-display text-4xl font-semibold text-line">{s.n}</span>
                </div>
                <h3 className="mt-5 font-display text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
                {s.extra}
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {s.badges.map((b) => (
                    <Chip key={b.text} kind={b.kind} small>
                      {b.text}
                    </Chip>
                  ))}
                </div>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- Why PayPal + AI ---------------- */}
      <section className="mx-auto max-w-6xl px-5 pt-24" aria-labelledby="why-heading">
        <Reveal className="max-w-2xl">
          <p className="label text-accent">Why PayPal + AI</p>
          <h2 id="why-heading" className="mt-3 font-display text-3xl font-semibold leading-tight sm:text-4xl">
            Neither works alone. Together, a 25¢ clip becomes a fair job.
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <Reveal delay={0.05} className="h-full">
            <div className="relative h-full overflow-hidden rounded-[1.25rem] bg-ink p-7 text-paper sm:p-9">
              <div aria-hidden className="absolute -right-20 -top-20 size-64 rounded-full bg-accent/30 blur-3xl" />
              <div className="relative">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#f3b18a]">Why AI</p>
                <h3 className="mt-3 font-display text-2xl font-semibold leading-snug sm:text-[1.7rem]">
                  At $0.25 a clip, a human reviewer costs more than the clip.
                </h3>
                <ul className="mt-6 space-y-3 text-sm text-paper/80">
                  <Bullet dark>Whisper (large-v3-turbo) transcribes every recording and identifies its language.</Bullet>
                  <Bullet dark>Qwen3 judges the clip against the sentence and gives feedback in the speaker&apos;s own language.</Bullet>
                  <Bullet dark>Guardrails hold the money when the signals disagree, so funders pay only for verified clips.</Bullet>
                  <Bullet dark>GPT-OSS 120B designs native-script prompts and writes the settlement agent&apos;s notes.</Bullet>
                </ul>
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.12} className="h-full">
            <div className="card relative h-full overflow-hidden p-7 sm:p-9">
              <div aria-hidden className="absolute -right-16 -bottom-24 size-64 rounded-full bg-[#ffc439]/25 blur-3xl" />
              <div className="relative">
                <p className="text-xs font-semibold uppercase tracking-wider text-ppblue">Why PayPal</p>
                <h3 className="mt-3 font-display text-2xl font-semibold leading-snug sm:text-[1.7rem]">
                  One Payouts batch pays many speakers, across markets.
                </h3>
                <ul className="mt-6 space-y-3 text-sm text-muted">
                  <Bullet>Speakers are paid through PayPal Payouts in batches, across the markets PayPal serves.</Bullet>
                  <Bullet>Funders pay with PayPal Checkout (Orders v2): familiar, buyer-protected funding.</Bullet>
                  <Bullet>When a campaign closes, unused budget is refunded automatically (Payments v2 refunds).</Bullet>
                  <Bullet>Signed PayPal webhooks keep every payment, payout and refund on the ledger.</Bullet>
                </ul>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------- Open campaigns ---------------- */}
      <section className="mx-auto max-w-6xl px-5 pt-24" aria-labelledby="open-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Reveal>
            <p className="label text-accent">Record &amp; earn</p>
            <h2 id="open-heading" className="mt-3 font-display text-3xl font-semibold sm:text-4xl">
              Open campaigns
            </h2>
          </Reveal>
          <Link href="/contribute" className="group text-sm font-semibold text-accent">
            See all{" "}
            <span aria-hidden className="inline-block transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        </div>
        {live.length === 0 ? (
          <div className="card mt-6 p-8 text-muted">
            No live campaigns yet.{" "}
            <Link href="/fund" className="font-semibold text-accent">
              Fund the first one →
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {live.map((c, i) => {
              const m = campaignMoney(c);
              const total = Math.max(1, c.funded_cents || c.budget_cents);
              return (
                <Reveal key={c.id} delay={(i % 3) * 0.06} className="h-full">
                  <Lift className="h-full">
                    <article className="card flex h-full flex-col p-5 transition-shadow hover:shadow-[0_18px_40px_-22px_rgba(31,27,22,0.35)]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="label">{c.language_name}</p>
                        <span className="pill bg-ok/10 text-ok">{usd(c.price_cents)} per clip</span>
                      </div>
                      <p className="mt-2 font-display text-xl font-semibold leading-snug">{c.title}</p>
                      <p className="mt-2 line-clamp-2 text-sm text-muted">{c.brief}</p>
                      <div className="mt-auto pt-5">
                        <ProgressBar
                          segments={[
                            { value: m.committed / total, color: "var(--accent)", label: `${usd(m.committed)} committed` },
                            { value: m.remaining / total, color: "rgba(15,118,110,0.35)", label: `${usd(m.remaining)} remaining` },
                          ]}
                        />
                        <div className="mt-2 flex items-center justify-between text-xs text-muted">
                          <span>
                            <span className="font-semibold text-ink">{usd(m.committed)}</span> committed ·{" "}
                            <span className="font-semibold text-ink">{usd(m.remaining)}</span> left
                          </span>
                          <span>{m.clipsLeft} clips left</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
                          <Link href={`/contribute/${c.id}`} className="text-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
                            Start recording →
                          </Link>
                          <Link href={`/campaigns/${c.id}`} className="text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink">
                            Close & refund
                          </Link>
                        </div>
                      </div>
                    </article>
                  </Lift>
                </Reveal>
              );
            })}
          </div>
        )}
      </section>

      {/* ---------------- Closing CTA ---------------- */}
      <div className="mt-24">
        <LayeredWaves seed={9} className="h-20 sm:h-28" />
        <section className="bg-paper-2 px-5 pb-20 pt-4" aria-labelledby="cta-heading">
          <Reveal className="mx-auto max-w-6xl">
            <div className="relative isolate overflow-hidden rounded-[1.75rem] border border-line bg-[#fffdf9] px-6 py-14 text-center shadow-[0_30px_60px_-40px_rgba(31,27,22,0.4)] sm:px-12 sm:py-20">
              <BlobScene seed={5} className="-z-10" />
              <p className="label text-accent">Your voice has value</p>
              <h2 id="cta-heading" className="mx-auto mt-4 max-w-3xl font-display text-3xl font-semibold leading-tight sm:text-5xl">
                Read a sentence. Get paid. Put <span className="italic text-accent">your</span> language on the map.
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-muted">
                Speakers earn per verified clip through PayPal. Funders pay only for verified data and get unused budget back automatically.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link href="/contribute" className="btn btn-accent shimmer">
                  Record &amp; earn →
                </Link>
                <Link href="/fund" className="btn btn-ghost bg-[#fffdf9]/70">
                  Fund a language
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, sr, accent, children }: { label: string; sr: string; accent?: boolean; children: ReactNode }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className="m-0">
        <span className="sr-only">{sr}</span>
        <span aria-hidden className={`flex items-baseline gap-1 font-display text-3xl font-semibold sm:text-4xl ${accent ? "text-accent" : "text-ink"}`}>
          {children}
        </span>
        <span aria-hidden className="mt-1 block text-xs text-muted">
          {label}
        </span>
      </dd>
    </div>
  );
}

function Chip({ kind, small, children }: { kind: "paypal" | "ai"; small?: boolean; children: ReactNode }) {
  const tone = kind === "paypal" ? "border-ppblue/15 bg-ppblue/[0.06] text-ppblue" : "border-accent/20 bg-accent/[0.07] text-accent-ink";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-semibold backdrop-blur ${tone} ${small ? "px-2.5 py-0.5 text-[11px]" : "px-3 py-1 text-xs"}`}>
      {kind === "paypal" ? <PayPalGlyph /> : <SparkGlyph />}
      {children}
    </span>
  );
}

function Bullet({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return (
    <li className="flex gap-3">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className={`mt-0.5 shrink-0 ${dark ? "text-[#f3b18a]" : "text-ok"}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 8.5l3 3 6-7" />
      </svg>
      <span>{children}</span>
    </li>
  );
}

function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden className="text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

function PayPalGlyph() {
  return (
    <svg width="10" height="12" viewBox="0 0 24 28" aria-hidden>
      <path fill="currentColor" d="M7.3 26.4H2.6a.8.8 0 0 1-.8-.9L5.4 2.3A1.4 1.4 0 0 1 6.8 1h8.3c4.6 0 7.5 2.4 6.7 6.7-.9 5.3-4.4 7.6-9.1 7.6H9.6a1 1 0 0 0-1 .8l-1.3 10.3z" />
    </svg>
  );
}

function SparkGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden fill="currentColor">
      <path d="M8 0.5l1.6 4.6a2 2 0 0 0 1.3 1.3L15.5 8l-4.6 1.6a2 2 0 0 0-1.3 1.3L8 15.5l-1.6-4.6a2 2 0 0 0-1.3-1.3L0.5 8l4.6-1.6a2 2 0 0 0 1.3-1.3z" />
    </svg>
  );
}

const ic = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

function IconWallet() {
  return (
    <svg {...ic}>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" />
      <rect x="3.5" y="7.5" width="17" height="11.5" rx="2.5" />
      <path d="M16 13.25h1.5" />
    </svg>
  );
}
function IconMic() {
  return (
    <svg {...ic}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg {...ic}>
      <path d="M12 3l7 3v5.5c0 4.4-3 7.9-7 9.5-4-1.6-7-5.1-7-9.5V6z" />
      <path d="M8.75 12.25l2.25 2.25 4.25-4.75" />
    </svg>
  );
}
function IconSend() {
  return (
    <svg {...ic}>
      <path d="M21 3L10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z" />
    </svg>
  );
}
