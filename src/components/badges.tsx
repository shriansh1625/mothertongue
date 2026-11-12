export function VerdictBadge({ verdict }: { verdict: string }) {
  const map: Record<string, string> = {
    accepted: "bg-ok/10 text-ok border-ok/20",
    rejected: "bg-bad/10 text-bad border-bad/20",
    review: "bg-warn/10 text-warn border-warn/20",
  };
  const label: Record<string, string> = { accepted: "Verified", rejected: "Rejected", review: "Needs review" };
  return <span className={`pill ${map[verdict] ?? "bg-paper-2"}`}>{label[verdict] ?? verdict}</span>;
}

export function PayoutBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    unpaid: ["bg-paper-2 text-muted border-line", "Awaiting payout"],
    queued: ["bg-ppblue/10 text-ppblue border-ppblue/20", "Payout sent"],
    paid: ["bg-ok/10 text-ok border-ok/20", "Paid via PayPal"],
    unclaimed: ["bg-warn/10 text-warn border-warn/20", "Unclaimed"],
    held: ["bg-warn/10 text-warn border-warn/20", "Held for review"],
    failed: ["bg-bad/10 text-bad border-bad/20", "Payout failed"],
  };
  const [cls, label] = map[status] ?? ["bg-paper-2", status];
  return <span className={`pill ${cls}`}>{label}</span>;
}
