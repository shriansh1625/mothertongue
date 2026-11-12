import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "MotherTongue: get paid to teach AI your language",
  description:
    "Speakers of under-served languages record short sentences, AI verifies every clip, and PayPal pays them. Funders pay only for verified data.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line/80 bg-paper/90 backdrop-blur sticky top-0 z-20">
          <div className="mx-auto max-w-6xl px-5 h-16 flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2.5">
              <Logo />
              <span className="font-display text-xl font-semibold">MotherTongue</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm font-medium">
              <Link href="/contribute" className="px-3 py-2 rounded-full hover:bg-paper-2">
                Record &amp; earn
              </Link>
              <Link href="/fund" className="px-3 py-2 rounded-full hover:bg-paper-2">
                Fund a language
              </Link>
              <Link href="/ledger" className="px-3 py-2 rounded-full hover:bg-paper-2 hidden sm:inline-flex">
                Ledger
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line mt-16">
          <div className="mx-auto max-w-6xl px-5 py-8 text-sm text-muted flex flex-col sm:flex-row gap-2 justify-between">
            <p>
              Built by <span className="font-semibold text-ink">SynapSoul Labs</span> for the PayPal AI Hackathon. Payments run in the
              PayPal sandbox.
            </p>
            <p>AI verifies the speech · PayPal moves the money · speakers keep the credit.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}

function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#1f1b16" />
      <path d="M8 19c2-6 4-6 6 0s4 6 6 0 3-5 4-3" stroke="#fbf7f0" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <circle cx="24" cy="11" r="2.6" fill="#c2410c" />
    </svg>
  );
}
