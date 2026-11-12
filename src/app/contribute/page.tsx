import Link from "next/link";
import { db, usd, campaignMoney, type Campaign } from "@/lib/db";
import { BlurryGradient, CircleScatter } from "@/components/backgrounds";
import { BlurText, Lift, ProgressBar, Reveal, Stagger, StaggerItem } from "@/components/motion/primitives";

export const dynamic = "force-dynamic";

export default function ContributePage() {
  const live = db().prepare("SELECT * FROM campaigns WHERE status = 'live' ORDER BY created_at DESC").all() as Campaign[];
  const samplesStmt = db().prepare("SELECT text, (SELECT COUNT(*) FROM prompts p2 WHERE p2.campaign_id = ?) AS n FROM prompts WHERE campaign_id = ? ORDER BY idx LIMIT 1");

  return (
    <div>
      <section className="relative overflow-hidden border-b border-line/70">
        <BlurryGradient intensity={0.9} />
        <CircleScatter seed={23} count={22} className="opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div className="relative mx-auto max-w-5xl px-5 pb-14 pt-14 sm:pt-20">
          <Reveal y={10}>
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-paper/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-accent backdrop-blur">
              <span className="size-1.5 rounded-full bg-accent" aria-hidden />
              For speakers
            </p>
          </Reveal>
          <h1 className="mt-4 font-display text-5xl font-semibold tracking-tight sm:text-6xl">
            <BlurText text="Record &" /> <BlurText text="earn" delay={0.14} className="text-accent" />
          </h1>
          <Reveal delay={0.2} y={10}>
            <p className="mt-4 max-w-2xl text-lg text-muted text-pretty">
              Pick a language you speak natively and read short sentences aloud. Each recording is checked by AI within seconds. Verified clips
              are paid to your PayPal account, and you see exactly why any clip was not accepted.
            </p>
            <ol className="mt-6 flex flex-wrap gap-2 text-sm" aria-label="How it works">
              {["Join with your PayPal email", "Read sentences aloud", "AI verifies each clip", "Get paid via PayPal"].map((s, i) => (
                <li key={s} className="inline-flex items-center gap-2 rounded-full border border-line bg-paper/80 py-1 pl-1 pr-3 backdrop-blur">
                  <span
                    className={`grid size-5 place-items-center rounded-full text-[11px] font-semibold ${i === 3 ? "bg-[#ffc439] text-ppblue" : "bg-ink text-paper"}`}
                  >
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-5 py-12">
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-display text-2xl font-semibold">Open campaigns</h2>
          {live.length > 0 && (
            <p className="text-sm text-muted">
              <span className="tabular-nums text-ink">{live.length}</span> accepting recordings
            </p>
          )}
        </div>

        {live.length === 0 ? (
          <div className="card mt-6 p-10 text-center">
            <p className="font-medium">No open campaigns right now.</p>
            <p className="mt-1 text-sm text-muted">New campaigns appear here as soon as a funder completes PayPal checkout. Check back soon.</p>
            <Link href="/fund" className="btn btn-ghost mt-5">
              Fund a language
            </Link>
          </div>
        ) : (
          <Stagger className="mt-6 grid gap-5 md:grid-cols-2">
            {live.map((c) => {
              const m = campaignMoney(c);
              const sample = samplesStmt.get(c.id, c.id) as { text: string; n: number } | undefined;
              const remainingFrac = c.funded_cents > 0 ? m.remaining / c.funded_cents : 0;
              return (
                <StaggerItem key={c.id} className="h-full">
                  <Lift className="h-full">
                    <article className="card group relative flex h-full flex-col overflow-hidden p-6 transition-shadow hover:shadow-[0_24px_50px_-28px_rgba(31,27,22,0.45)]">
                      <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-accent/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
                      <div className="relative flex items-center justify-between gap-2">
                        <span className="pill border-line bg-paper-2">{c.language_name}</span>
                        <span className="pill bg-ok/10 text-ok">{usd(c.price_cents)} / verified clip</span>
                      </div>

                      <div className="relative mt-5 rounded-xl border border-line/70 bg-paper/70 px-4 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{sample ? "Sample sentence" : "Language"}</p>
                        <p className="script mt-1.5 line-clamp-2 text-2xl leading-snug text-ink sm:text-[1.7rem]">{sample?.text ?? c.language_name}</p>
                      </div>

                      <p className="relative mt-5 font-display text-2xl font-semibold leading-tight">{c.title}</p>
                      <p className="relative mt-2 line-clamp-3 text-sm text-muted">{c.brief}</p>

                      <div className="relative mt-auto pt-6">
                        <ProgressBar segments={[{ value: remainingFrac, color: "var(--ok)", label: "Budget remaining" }]} className="h-2" />
                        <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                          <span>
                            <span className="font-semibold tabular-nums">{m.clipsLeft}</span> <span className="text-muted">clips left</span>
                            {sample && <span className="text-muted"> · {sample.n} sentences</span>}
                          </span>
                          <span className="truncate text-muted">
                            funded by <span className="text-ink">{c.funder_name}</span>
                          </span>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                          <Link href={`/contribute/${c.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
                            Start recording
                            <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">
                              →
                            </span>
                          </Link>
                          <Link href={`/campaigns/${c.id}`} className="text-sm font-semibold text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink">
                            Close campaign & refund
                          </Link>
                        </div>
                      </div>
                    </article>
                  </Lift>
                </StaggerItem>
              );
            })}
          </Stagger>
        )}
      </div>
    </div>
  );
}
