import { notFound } from "next/navigation";
import Link from "next/link";
import { db, getCampaign, getPrompts, usd, campaignMoney } from "@/lib/db";
import { currentContributor } from "@/lib/session";
import { BlurryGradient } from "@/components/backgrounds";
import { BlurText, ProgressBar, Reveal } from "@/components/motion/primitives";
import { JoinForm } from "./join";
import { Recorder } from "./recorder";

export const dynamic = "force-dynamic";

export default async function RecordPage(props: PageProps<"/contribute/[id]">) {
  const { id } = await props.params;
  const campaign = getCampaign(id);
  if (!campaign) notFound();
  const me = await currentContributor();
  const prompts = getPrompts(id);
  const money = campaignMoney(campaign);
  const done = me
    ? (db()
        .prepare("SELECT DISTINCT prompt_id FROM clips WHERE campaign_id = ? AND contributor_id = ? AND verdict = 'accepted'")
        .all(id, me.id) as { prompt_id: string }[]).map((r) => r.prompt_id)
    : [];
  const remainingFrac = campaign.funded_cents > 0 ? money.remaining / campaign.funded_cents : 0;

  return (
    <div className="relative">
      <div className="absolute inset-x-0 top-0 h-[420px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_40%,transparent)]">
        <BlurryGradient intensity={0.75} />
      </div>
      <div className="relative mx-auto max-w-5xl px-5 py-10">
        <Link
          href="/contribute"
          className="group inline-flex items-center gap-1.5 rounded-full text-sm text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
        >
          <span aria-hidden className="transition-transform group-hover:-translate-x-0.5">
            ←
          </span>{" "}
          All campaigns
        </Link>
        <Reveal y={10}>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="pill border-line bg-paper-2">{campaign.language_name}</span>
            <span className="pill bg-ok/10 text-ok">{usd(campaign.price_cents)} per verified clip</span>
            <span className="text-sm text-muted">{money.clipsLeft} clips left in budget</span>
          </div>
        </Reveal>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          <BlurText text={campaign.title} />
        </h1>
        <Reveal delay={0.15} y={10}>
          <p className="mt-3 max-w-3xl text-muted text-pretty">{campaign.brief}</p>
          <div className="mt-5 flex max-w-md flex-col gap-1.5">
            <ProgressBar segments={[{ value: remainingFrac, color: "var(--ok)", label: "Budget remaining" }]} />
            <p className="text-xs text-muted">
              {usd(money.remaining)} of {usd(campaign.funded_cents)} budget remaining · funded by <span className="text-ink">{campaign.funder_name}</span>
            </p>
          </div>
        </Reveal>

        {campaign.status !== "live" ? (
          <div className="card mt-8 flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">
                {campaign.status === "closed" ? "This campaign has closed." : "This campaign is not accepting recordings yet."}
              </p>
              <p className="mt-1 text-sm text-muted">
                {campaign.status === "closed" ? "Thank you to everyone who recorded. Clips already verified are still paid via PayPal." : "It opens once the funder completes PayPal checkout."}
              </p>
            </div>
            <Link href="/contribute" className="btn btn-ghost shrink-0">
              See open campaigns
            </Link>
          </div>
        ) : !me ? (
          <JoinForm />
        ) : (
          <Recorder
            campaignId={id}
            languageName={campaign.language_name}
            priceCents={campaign.price_cents}
            prompts={prompts.map((p) => ({ id: p.id, text: p.text, gloss: p.gloss ?? "" }))}
            initiallyDone={done}
            me={{ name: me.display_name, email: me.paypal_email, uiLanguage: me.ui_language }}
          />
        )}
      </div>
    </div>
  );
}
