/** Route-level loading skeleton: paper-toned blocks with the shared .shimmer sheen. */
function Bar({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`shimmer rounded-full bg-paper-2 ${className}`} />;
}

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-14 sm:py-20" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <Bar className="h-3 w-32" />
      <Bar className="mt-5 h-10 w-full max-w-md sm:h-12" />
      <Bar className="mt-4 h-4 w-full max-w-2xl" />
      <Bar className="mt-2 h-4 w-2/3 max-w-xl" />
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} aria-hidden className="card p-6" style={{ opacity: 1 - i * 0.18 }}>
            <div className="flex items-center gap-3">
              <div className="shimmer size-10 rounded-full bg-paper-2" />
              <div className="flex-1">
                <Bar className="h-3 w-1/2" />
                <Bar className="mt-2 h-3 w-1/3" />
              </div>
            </div>
            <Bar className="mt-6 h-3 w-full" />
            <Bar className="mt-2 h-3 w-5/6" />
            <Bar className="mt-6 h-2.5 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
