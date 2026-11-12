import { Stagger, StaggerItem } from "@/components/motion/primitives";

const STEPS = [
  {
    title: "Describe the voices you need",
    body: "Name the language or dialect and what the data is for. GPT-OSS 120B on Groq writes recording prompts in the language's own script, each with an English gloss.",
  },
  {
    title: "Fund the budget with PayPal",
    body: "Review the AI-designed prompts, then fund through PayPal Checkout (Orders v2, sandbox). Your campaign goes live for speakers straight away.",
  },
  {
    title: "Pay only for verified clips",
    body: "Whisper large-v3-turbo transcribes every clip and identifies the language; a Qwen3 judge checks it against the prompt and explains its verdict in the speaker's language.",
  },
];

const PROMISES = [
  "Rejected, silent or wrong-language clips cost you nothing.",
  "Speakers receive their full rate through PayPal Payouts, sent in batches.",
  "Close the campaign whenever you like: unused budget is refunded to your PayPal.",
];

/** Left-column explainer: numbered steps plus the pay-for-verified promise. Server-safe (no hooks). */
export function FundExplainer() {
  return (
    <div className="space-y-6">
      <div>
        <p className="label">How funding works</p>
        <Stagger className="relative mt-4 space-y-5" gap={0.1}>
          <span aria-hidden className="absolute bottom-6 left-[17px] top-6 w-px bg-gradient-to-b from-accent/40 via-line to-ok/40" />
          {STEPS.map((s, i) => (
            <StaggerItem key={s.title} className="relative flex gap-4">
              <span className="relative z-10 grid size-9 shrink-0 place-items-center rounded-full border border-line bg-[#fffdf9] font-display text-sm font-semibold text-accent shadow-[0_4px_12px_-6px_rgba(31,27,22,0.25)]">
                {i + 1}
              </span>
              <div className="pt-1">
                <h3 className="font-semibold text-ink">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>

      <div className="relative overflow-hidden rounded-[1.25rem] border border-ok/20 bg-gradient-to-br from-ok/[0.07] via-[#fffdf9] to-[#fffdf9] p-5">
        <svg aria-hidden viewBox="0 0 120 120" className="pointer-events-none absolute -right-6 -top-6 size-28 text-ok/10">
          <circle cx="60" cy="60" r="56" fill="currentColor" />
        </svg>
        <div className="relative flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-full bg-ok text-white" aria-hidden>
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 2.5 4 5v4.5c0 3.8 2.6 6.9 6 8 3.4-1.1 6-4.2 6-8V5l-6-2.5Z" />
              <path d="m7.3 10 1.9 1.9 3.6-3.8" />
            </svg>
          </span>
          <h3 className="font-display text-lg font-semibold">You only pay for verified clips</h3>
        </div>
        <ul className="relative mt-3 space-y-2">
          {PROMISES.map((p) => (
            <li key={p} className="flex gap-2.5 text-sm text-ink/85">
              <svg viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0 text-ok" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m5 10.5 3.2 3L15 6.5" />
              </svg>
              {p}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
