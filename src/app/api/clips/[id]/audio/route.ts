import { db } from "@/lib/db";

export async function GET(_req: Request, ctx: RouteContext<"/api/clips/[id]/audio">) {
  const { id } = await ctx.params;
  const row = db().prepare("SELECT audio, mime FROM clips WHERE id = ?").get(id) as { audio: Uint8Array; mime: string } | undefined;
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.audio), {
    headers: { "Content-Type": row.mime.split(";")[0] || "audio/webm", "Cache-Control": "private, max-age=3600" },
  });
}
