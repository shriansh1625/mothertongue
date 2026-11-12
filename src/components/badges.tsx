/**
 * Status badges. Hook-free so they render in both server and client components.
 * Labels are part of the product vocabulary; keep them stable.
 */

type IconName = "check" | "x" | "eye" | "clock" | "send" | "paypal" | "alert" | "pause";

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 12,
    height: 12,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: "shrink-0",
  };
  switch (name) {
    case "check":
      return (
        <svg {...common}>
          <path d="M3.5 8.5l3 3 6-7" />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
        </svg>
      );
    case "eye":
      return (
        <svg {...common}>
          <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" />
          <circle cx="8" cy="8" r="1.8" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 5v3.2l2 1.3" />
        </svg>
      );
    case "send":
      return (
        <svg {...common}>
          <path d="M14 2L7 9M14 2l-4.5 12-2.5-5-5-2.5L14 2z" />
        </svg>
      );
    case "paypal":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M5.2 14.2H2.9a.4.4 0 01-.4-.5L4.4 2.3c.06-.3.3-.5.6-.5h4.3c2.3 0 3.8 1.2 3.4 3.4-.4 2.6-2.2 3.7-4.6 3.7H6.6a.5.5 0 00-.5.4l-.9 4.9z" />
        </svg>
      );
    case "alert":
      return (
        <svg {...common}>
          <path d="M8 2.2l6.2 11H1.8L8 2.2z" />
          <path d="M8 6.5v3M8 11.6v.1" />
        </svg>
      );
    case "pause":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" />
          <path d="M6.6 5.8v4.4M9.4 5.8v4.4" />
        </svg>
      );
  }
}

const VERDICT: Record<string, { cls: string; label: string; icon: IconName }> = {
  accepted: { cls: "bg-ok/10 text-ok border-ok/20", label: "Verified", icon: "check" },
  rejected: { cls: "bg-bad/10 text-bad border-bad/20", label: "Rejected", icon: "x" },
  review: { cls: "bg-warn/10 text-warn border-warn/20", label: "Needs review", icon: "eye" },
};

export function VerdictBadge({ verdict }: { verdict: string }) {
  const v = VERDICT[verdict];
  return (
    <span className={`pill ${v?.cls ?? "bg-paper-2 border-line"}`}>
      {v && <Icon name={v.icon} />}
      {v?.label ?? verdict}
    </span>
  );
}

const PAYOUT: Record<string, { cls: string; label: string; icon: IconName; pulse?: boolean }> = {
  unpaid: { cls: "bg-paper-2 text-muted border-line", label: "Awaiting payout", icon: "clock" },
  queued: { cls: "bg-ppblue/10 text-ppblue border-ppblue/20", label: "Payout sent", icon: "send", pulse: true },
  paid: { cls: "bg-ok/10 text-ok border-ok/20", label: "Paid via PayPal", icon: "paypal" },
  unclaimed: { cls: "bg-warn/10 text-warn border-warn/20", label: "Unclaimed", icon: "clock" },
  held: { cls: "bg-warn/10 text-warn border-warn/20", label: "Held for review", icon: "pause" },
  failed: { cls: "bg-bad/10 text-bad border-bad/20", label: "Payout failed", icon: "alert" },
};

export function PayoutBadge({ status }: { status: string }) {
  const p = PAYOUT[status];
  return (
    <span className={`pill relative ${p?.cls ?? "bg-paper-2 border-line"}`}>
      {p?.pulse && (
        <span aria-hidden className="relative -ml-0.5 mr-0.5 flex size-1.5">
          <span className="absolute inline-flex size-full rounded-full bg-current opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      )}
      {p && <Icon name={p.icon} />}
      {p?.label ?? status}
    </span>
  );
}
