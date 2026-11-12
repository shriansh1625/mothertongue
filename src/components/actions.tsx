"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function FundButton({ campaignId, label }: { campaignId: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <button
        className="btn btn-paypal w-full text-base"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch(`/api/campaigns/${campaignId}/fund`, { method: "POST" });
          const j = await res.json();
          if (!res.ok) {
            setError(j.error || "Could not start PayPal checkout");
            setBusy(false);
            return;
          }
          window.location.href = j.approveUrl;
        }}
      >
        {busy ? (
          "Opening PayPal…"
        ) : (
          <>
            <span className="font-bold italic text-ppblue">Pay</span>
            <span className="font-bold italic text-[#009cde] -ml-2">Pal</span>
            <span>· {label}</span>
          </>
        )}
      </button>
      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  );
}

export function PostButton({
  url,
  label,
  busyLabel,
  confirm: confirmText,
  className = "btn btn-ghost",
}: {
  url: string;
  label: string;
  busyLabel: string;
  confirm?: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="space-y-1.5">
      <button
        className={className}
        disabled={busy}
        onClick={async () => {
          if (confirmText && !window.confirm(confirmText)) return;
          setBusy(true);
          setMsg(null);
          try {
            const res = await fetch(url, { method: "POST" });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(j.error || "Request failed");
            setMsg({ ok: true, text: j.message || (j.refundedCents !== undefined ? `Refunded $${(j.refundedCents / 100).toFixed(2)} via PayPal.` : "Done.") });
            router.refresh();
          } catch (e) {
            setMsg({ ok: false, text: (e as Error).message });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? busyLabel : label}
      </button>
      {msg && <p className={`text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
    </div>
  );
}

export function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
