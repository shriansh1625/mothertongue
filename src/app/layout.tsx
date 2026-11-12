import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import { Grain } from "@/components/backgrounds";
import { SiteHeader } from "@/components/shell/header";
import { SiteFooter } from "@/components/shell/footer";
import { MotionProvider } from "@/components/shell/motion-provider";
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
      <body className="min-h-full flex flex-col selection:bg-accent/20 selection:text-ink">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[70] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-paper"
        >
          Skip to content
        </a>
        <MotionProvider>
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </MotionProvider>
        <Grain opacity={0.04} />
      </body>
    </html>
  );
}
