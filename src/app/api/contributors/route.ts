import { NextResponse } from "next/server";
import { db, newId, type Contributor } from "@/lib/db";
import { cookies } from "next/headers";
import { SPEAKER_COOKIE } from "@/lib/session";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Join (or re-join) as a speaker. PayPal email is where payouts are sent. */
export async function POST(req: Request) {
  if (!rateLimit("contributors", req, 20, 10 * 60_000)) return tooManyRequests();
  const body = (await req.json().catch(() => ({}))) as { name?: string; email?: string; uiLanguage?: string; consent?: boolean };
  const name = (body.name || "").trim().slice(0, 60);
  const email = (body.email || "").trim().toLowerCase().slice(0, 120);
  const uiLanguage = (body.uiLanguage || "English").trim().slice(0, 40);
  if (!name || !EMAIL.test(email)) return NextResponse.json({ error: "Enter your name and a valid PayPal email." }, { status: 400 });
  if (!body.consent) return NextResponse.json({ error: "Please accept the recording consent." }, { status: 400 });

  const d = db();
  let c = d.prepare("SELECT * FROM contributors WHERE paypal_email = ?").get(email) as Contributor | undefined;
  if (!c) {
    const id = newId("spk");
    d.prepare("INSERT INTO contributors (id, display_name, paypal_email, ui_language) VALUES (?, ?, ?, ?)").run(id, name, email, uiLanguage);
    c = d.prepare("SELECT * FROM contributors WHERE id = ?").get(id) as Contributor;
  } else if ((await cookies()).get(SPEAKER_COOKIE)?.value === c.id) {
    // only the browser already signed in as this speaker may rename them
    d.prepare("UPDATE contributors SET display_name = ?, ui_language = ? WHERE id = ?").run(name, uiLanguage, c.id);
  }
  const res = NextResponse.json({ id: c.id });
  res.cookies.set(SPEAKER_COOKIE, c.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90 });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SPEAKER_COOKIE);
  return res;
}
