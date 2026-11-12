import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db, newId, logEvent } from "@/lib/db";
import { designCampaign, claudeConfigured } from "@/lib/ai";
import { ownerCookie } from "@/lib/session";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    funderName?: string;
    language?: string;
    brief?: string;
    count?: number;
    priceCents?: number;
    budgetCents?: number;
  };
  const funderName = (body.funderName || "").trim().slice(0, 80);
  const language = (body.language || "").trim().slice(0, 60);
  const brief = (body.brief || "").trim().slice(0, 800);
  const count = Math.min(30, Math.max(4, Math.round(body.count ?? 12)));
  const budgetCents = Math.round(body.budgetCents ?? 0);
  if (!funderName || !language || brief.length < 10) {
    return NextResponse.json({ error: "Please fill in your name, the language, and a short brief." }, { status: 400 });
  }
  if (budgetCents < 100 || budgetCents > 1_000_000) {
    return NextResponse.json({ error: "Budget must be between $1 and $10,000 (sandbox)." }, { status: 400 });
  }
  if (!claudeConfigured()) {
    return NextResponse.json({ error: "AI is not configured on this server (ANTHROPIC_API_KEY missing)." }, { status: 503 });
  }

  let design;
  try {
    design = await designCampaign({ language, brief, count });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  const priceCents = Math.round(body.priceCents && body.priceCents >= 5 ? body.priceCents : design.suggested_price_cents);
  const id = newId("cmp");
  const ownerToken = crypto.randomBytes(18).toString("base64url");
  const d = db();
  d.exec("BEGIN");
  try {
    d.prepare(
      `INSERT INTO campaigns (id, title, brief, language_code, language_name, funder_name, price_cents, budget_cents, owner_token, ai_rationale)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, design.title, brief, design.language_code, design.language_name, funderName, priceCents, budgetCents, ownerToken, design.rationale);
    design.prompts.forEach((p, i) => {
      d.prepare("INSERT INTO prompts (id, campaign_id, idx, text, gloss) VALUES (?, ?, ?, ?, ?)").run(newId("prm"), id, i, p.text, p.gloss);
    });
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  logEvent("ai.design", id, `Claude designed "${design.title}": ${design.prompts.length} ${design.language_name} prompts, suggested ${design.suggested_price_cents}c/clip`);

  const res = NextResponse.json({ id });
  res.cookies.set(ownerCookie(id), ownerToken, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 60 });
  return res;
}
