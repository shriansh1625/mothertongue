import { db, safeAudioMime } from "@/lib/db";

export const dynamic = "force-dynamic";

const EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

export async function GET(req: Request, ctx: RouteContext<"/api/clips/[id]/audio">) {
  const { id } = await ctx.params;
  const row = db().prepare("SELECT audio, mime FROM clips WHERE id = ?").get(id) as { audio: Uint8Array; mime: string } | undefined;
  if (!row) return new Response("Not found", { status: 404 });

  // Copy out of the SQLite buffer. A subarray view would make Node send the whole allocation, which breaks Safari seeking.
  const body = new Uint8Array(row.audio.byteLength);
  body.set(row.audio);
  const total = body.byteLength;
  const type = safeAudioMime(row.mime);
  const base: Record<string, string> = {
    "Content-Type": type,
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `inline; filename="clip.${EXT[type] ?? "webm"}"`,
    "Content-Security-Policy": "sandbox",
    "Accept-Ranges": "bytes",
  };

  const range = req.headers.get("range");
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (range && m && total > 0 && (m[1] !== "" || m[2] !== "")) {
    let start: number;
    let end: number;
    if (m[1] === "") {
      // suffix range: last N bytes
      const n = Number(m[2]);
      start = Math.max(0, total - n);
      end = total - 1;
    } else {
      start = Number(m[1]);
      end = m[2] === "" ? total - 1 : Math.min(Number(m[2]), total - 1);
    }
    if (start >= total || start > end) {
      return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${total}` } });
    }
    const slice = body.slice(start, end + 1);
    return new Response(slice, {
      status: 206,
      headers: { ...base, "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(slice.byteLength) },
    });
  }

  return new Response(body, { headers: { ...base, "Content-Length": String(total) } });
}
