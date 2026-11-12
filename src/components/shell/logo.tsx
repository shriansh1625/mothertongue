/** MotherTongue logo mark (server-safe, no hooks). */
export function Logo({ size = 30, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={className}>
      <rect width="32" height="32" rx="9" fill="#1f1b16" />
      <path d="M8 19c2-6 4-6 6 0s4 6 6 0 3-5 4-3" stroke="#fbf7f0" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <circle cx="24" cy="11" r="2.6" fill="#c2410c" />
    </svg>
  );
}
