import { db } from "@/lib/db";
import { AutoRefresh } from "@/components/actions";
import { CircleScatter } from "@/components/backgrounds";
import { Reveal } from "@/components/motion/primitives";
import { LedgerFeed, type LedgerEvent } from "@/components/shell/ledger-feed";

export const dynamic = "force-dynamic";

const LEGEND = [
  { dot: "bg-ppblue", label: "PayPal", body: "Orders, captures, payouts, refunds, webhooks" },
  { dot: "bg-accent", label: "AI", body: "Transcription, clip judging, campaign design" },
  { dot: "bg-ok", label: "Agent", body: "Settlement agent actions and notes" },
];

export default function LedgerPage() {
  const rows = db().prepare("SELECT id, kind, ref, summary, created_at FROM events ORDER BY id DESC LIMIT 300").all() as LedgerEvent[];
  // DB rows are null-prototype objects; copy into plain objects so they can cross into the client component.
  const events: LedgerEvent[] = rows.map((r) => ({ id: Number(r.id), kind: String(r.kind), ref: r.ref == null ? null : String(r.ref), summary: String(r.summary), created_at: String(r.created_at) }));
  return (
    <div>
      <AutoRefresh seconds={6} />
      <section className="relative overflow-hidden border-b border-line/70">
        <CircleScatter seed={23} count={30} className="opacity-60 [mask-image:linear-gradient(to_bottom,#000,transparent)]" />
        <div className="relative mx-auto max-w-6xl px-5 pb-10 pt-14 sm:pt-20">
          <Reveal>
            <div className="flex flex-wrap items-center gap-3">
              <p className="label text-accent">Inspectable by design</p>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ok/20 bg-ok/[0.07] px-2.5 py-0.5 text-[11px] font-semibold text-ok">
                <span className="relative flex size-1.5" aria-hidden>
                  <span className="absolute inline-flex size-full rounded-full bg-ok/60 motion-safe:animate-ping" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-ok" />
                </span>
                Live · refreshes every 6s
              </span>
            </div>
            <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Ledger</h1>
            <p className="mt-3 max-w-2xl text-muted">
              Every PayPal API call, webhook, AI decision and settlement-agent action, newest first. Nothing moves money without leaving a
              trace here.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <ul className="mt-8 grid gap-3 sm:grid-cols-3">
              {LEGEND.map((l) => (
                <li key={l.label} className="flex items-start gap-3 rounded-2xl border border-line bg-white/60 px-4 py-3 backdrop-blur-sm">
                  <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${l.dot}`} />
                  <span className="text-sm">
                    <span className="font-semibold">{l.label}</span>
                    <span className="block text-muted">{l.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>
      <div className="mx-auto max-w-4xl px-5 py-10">
        <LedgerFeed events={events} />
      </div>
    </div>
  );
}
