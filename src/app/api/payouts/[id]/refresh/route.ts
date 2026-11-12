import { NextResponse } from "next/server";
import { refreshPayout } from "@/lib/settle";

export async function POST(_req: Request, ctx: RouteContext<"/api/payouts/[id]/refresh">) {
  const { id } = await ctx.params;
  try {
    await refreshPayout(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message.slice(0, 200) }, { status: 502 });
  }
}
