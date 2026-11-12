import type { Metadata } from "next";
import { BlurryGradient } from "@/components/backgrounds";
import { BlurText, Reveal } from "@/components/motion/primitives";
import { FundExplainer } from "@/components/fund/fund-explainer";
import { CreateCampaignForm } from "./form";

export const metadata: Metadata = {
  title: "Fund a language · MotherTongue",
  description: "Describe the speech data you need. AI designs native-script prompts; you fund with PayPal and pay only for verified clips.",
};

const BADGES = ["PayPal Checkout · sandbox", "Prompts by GPT-OSS 120B", "Verified by Whisper + Qwen3", "Unused budget refunded"];

export default function FundPage() {
  return (
    <div>
      <section className="relative overflow-hidden border-b border-line/70">
        <BlurryGradient intensity={0.6} />
        <div
          aria-hidden
          className="dot-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
        />
        <div className="relative mx-auto max-w-6xl px-5 pb-12 pt-12 sm:pb-16 sm:pt-20">
          <p className="pill border-accent/20 bg-[#fffdf9]/80 text-accent backdrop-blur">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden />
            For NGOs, researchers, AI teams
          </p>
          <h1 className="font-display mt-5 max-w-3xl text-4xl font-semibold leading-[1.05] sm:text-6xl">
            <BlurText text="Fund a language." />
            <span className="rise mt-1 block text-gradient [animation-delay:0.35s]">Pay only for verified voices.</span>
          </h1>
          <Reveal delay={0.25}>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
              Describe the speech you need. AI (GPT-OSS 120B) designs the recording prompts in the language&apos;s own script. You fund the budget with
              PayPal and pay only for clips that pass verification. Whatever isn&apos;t used is refunded to your PayPal automatically.
            </p>
          </Reveal>
          <Reveal delay={0.4}>
            <ul className="mt-6 flex flex-wrap gap-2" aria-label="What powers this">
              {BADGES.map((b) => (
                <li key={b} className="pill border-line bg-[#fffdf9]/70 px-3 py-1 text-ink/75 backdrop-blur">
                  {b}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
        <CreateCampaignForm explainer={<FundExplainer />} />
      </div>
    </div>
  );
}
