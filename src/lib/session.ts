import { cookies } from "next/headers";
import { db, type Campaign, type Contributor } from "./db";

export const SPEAKER_COOKIE = "mt_speaker";
export const ownerCookie = (campaignId: string) => `mt_owner_${campaignId}`;

export async function currentContributor(): Promise<Contributor | null> {
  const id = (await cookies()).get(SPEAKER_COOKIE)?.value;
  if (!id) return null;
  return (db().prepare("SELECT * FROM contributors WHERE id = ?").get(id) as Contributor | undefined) ?? null;
}

export async function isOwner(c: Campaign): Promise<boolean> {
  return (await cookies()).get(ownerCookie(c.id))?.value === c.owner_token;
}

export function baseUrl(req?: Request): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  if (req) {
    const u = new URL(req.url);
    const proto = req.headers.get("x-forwarded-proto") || u.protocol.replace(":", "");
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || u.host;
    return `${proto}://${host}`;
  }
  return "http://localhost:3000";
}
