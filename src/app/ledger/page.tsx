import { db } from "@/lib/db";
import { AutoRefresh } from "@/components/actions";

export const dynamic = "force-dynamic";

type Ev = { id: number; kind: string; ref: string | null; summary: string; created_at: string };

const KIND: Record<string, string> = {
  "paypal.api": "bg-ppblue/10 text-ppblue border-ppblue/20",
  "paypal.webhook": "bg-ppblue/10 text-ppblue border-ppblue/20",
  "paypal.order": "bg-ppblue/10 text-ppblue border-ppblue/20",
  "paypal.capture": "bg-ppblue/10 text-ppblue border-ppblue/20",
  "paypal.refund": "bg-ppblue/10 text-ppblue border-ppblue/20",
  "ai.claude": "bg-accent/10 text-accent border-accent/20",
  "ai.judge": "bg-accent/10 text-accent border-accent/20",
  "ai.design": "bg-accent/10 text-accent border-accent/20",
  "agent.settle": "bg-ok/10 text-ok border-ok/20",
};

export default function LedgerPage() {
  const events = db().prepare("SELECT id, kind, ref, summary, created_at FROM events ORDER BY id DESC LIMIT 300").all() as Ev[];
  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <AutoRefresh seconds={6} />
      <p className="label text-accent">Inspectable by design</p>
      <h1 className="font-display text-4xl font-semibold mt-2">Ledger</h1>
      <p className="text-muted mt-3 max-w-2xl">
        Every PayPal API call, webhook, AI decision and settlement-agent action, newest first. Nothing moves money without leaving a
        trace here.
      </p>
      <div className="card mt-8 divide-y divide-line">
        {events.length === 0 && <p className="p-6 text-muted">No activity yet.</p>}
        {events.map((e) => (
          <div key={e.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm">
            <span className="font-mono text-xs text-muted w-40 shrink-0">{e.created_at} UTC</span>
            <span className={`pill ${KIND[e.kind] ?? "bg-paper-2 border-line"} w-fit`}>{e.kind}</span>
            <span className="flex-1">{e.summary}</span>
            {e.ref && <span className="font-mono text-xs text-muted">{e.ref}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
