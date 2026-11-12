/** Site footer (server component): Haikei-style layered-wave edge, stack credits, sandbox note. */
import Link from "next/link";
import { LayeredWaves } from "@/components/backgrounds";
import { Logo } from "./logo";

const STACK: { group: string; tone: string; items: string[] }[] = [
  { group: "PayPal", tone: "text-ppblue border-ppblue/15 bg-ppblue/[0.05]", items: ["Orders v2", "Payouts", "Refunds", "Webhooks"] },
  { group: "AI on Groq", tone: "text-accent-ink border-accent/15 bg-accent/[0.06]", items: ["Whisper large-v3 turbo", "GPT-OSS 120B", "Qwen3"] },
  { group: "Web", tone: "text-ink border-line bg-white/60", items: ["Next.js", "Motion"] },
];

const EXPLORE = [
  { href: "/contribute", label: "Record & earn" },
  { href: "/fund", label: "Fund a language" },
  { href: "/ledger", label: "Ledger" },
];

export function SiteFooter() {
  return (
    <footer className="relative mt-16">
      <LayeredWaves seed={11} className="h-16 sm:h-24" />
      <div className="bg-paper-2">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 pb-10 pt-6 sm:grid-cols-2 lg:grid-cols-[1.3fr_1.6fr_0.8fr]">
          <div>
            <Link href="/" className="inline-flex items-center gap-2.5 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
              <Logo size={28} />
              <span className="font-display text-lg font-semibold">MotherTongue</span>
            </Link>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
              Speakers of under-served languages record short sentences, AI verifies every clip, and PayPal pays them. Funders pay only
              for verified data, and unused budget is refunded.
            </p>
            <p className="mt-5 text-sm text-muted">
              Built by <span className="font-semibold text-ink">SynapSoul Labs</span> for the PayPal AI Hackathon.
            </p>
          </div>

          <div>
            <h2 className="label">Built with</h2>
            <dl className="mt-3 space-y-3">
              {STACK.map((s) => (
                <div key={s.group} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
                  <dt className="w-24 shrink-0 pt-1 text-xs font-semibold text-muted">{s.group}</dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {s.items.map((i) => (
                      <span key={i} className={`pill ${s.tone}`}>
                        {i}
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <nav aria-label="Footer">
            <h2 className="label">Explore</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {EXPLORE.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="group inline-flex items-center gap-1.5 rounded text-ink/80 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {l.label}
                    <span aria-hidden className="translate-x-0 opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="border-t border-line/80">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
            <p className="inline-flex items-center gap-2">
              <span className="inline-block size-1.5 rounded-full bg-ppblue" aria-hidden />
              Payments run in the PayPal sandbox. No real money moves.
            </p>
            <p>AI verifies the speech · PayPal moves the money · speakers keep the credit.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
