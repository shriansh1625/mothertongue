import { CreateCampaignForm } from "./form";

export default function FundPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <p className="label text-accent">For NGOs, researchers, AI teams</p>
      <h1 className="font-display text-4xl font-semibold mt-2">Fund a language</h1>
      <p className="text-muted mt-3">
        Describe the speech you need. AI (GPT-OSS 120B) designs the recording prompts in the language&apos;s own script. You fund the budget with
        PayPal and pay only for clips that pass verification. Whatever isn&apos;t used is refunded to your PayPal automatically.
      </p>
      <CreateCampaignForm />
    </div>
  );
}
