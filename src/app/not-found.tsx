import Link from "next/link";
import { BlobScene } from "@/components/backgrounds";
import { Reveal } from "@/components/motion/primitives";

const LINKS = [
  { href: "/contribute", label: "Record & earn" },
  { href: "/fund", label: "Fund a language" },
  { href: "/ledger", label: "Ledger" },
];

export default function NotFound() {
  return (
    <section className="relative isolate overflow-hidden">
      <BlobScene seed={9} className="-z-10" />
      <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center px-5 py-24 text-center">
        <Reveal>
          <p className="label text-accent">Error 404</p>
          <h1 className="mt-4 font-display text-7xl font-semibold leading-none sm:text-8xl">
            <span className="text-gradient">404</span>
          </h1>
          <p className="script mt-5 text-xl text-ink/70" lang="hi">
            पृष्ठ नहीं मिला
          </p>
          <p className="mt-1 text-sm text-muted">&ldquo;Page not found&rdquo;, in Hindi.</p>
          <p className="mx-auto mt-6 max-w-md text-muted">
            This page seems to have slipped through the cracks. Let&rsquo;s get you back to somewhere that speaks your language.
          </p>
        </Reveal>
        <Reveal delay={0.12}>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/" className="btn btn-primary shimmer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              Back to home
            </Link>
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="btn btn-ghost focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                {l.label}
              </Link>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
