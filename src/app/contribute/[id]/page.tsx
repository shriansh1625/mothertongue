import { notFound } from "next/navigation";
import Link from "next/link";
import { db, getCampaign, getPrompts, usd, campaignMoney } from "@/lib/db";
import { currentContributor } from "@/lib/session";
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

  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <Link href="/contribute" className="text-sm text-muted hover:text-ink">
        ← All campaigns
      </Link>
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <span className="pill bg-paper-2 border-line">{campaign.language_name}</span>
        <span className="pill bg-ok/10 text-ok">{usd(campaign.price_cents)} per verified clip</span>
        <span className="text-sm text-muted">{money.clipsLeft} clips left in budget</span>
      </div>
      <h1 className="font-display text-4xl font-semibold mt-3">{campaign.title}</h1>
      <p className="text-muted mt-2">{campaign.brief}</p>

      {campaign.status !== "live" ? (
        <div className="card p-6 mt-8 text-muted">This campaign is not accepting recordings right now.</div>
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
  );
}
