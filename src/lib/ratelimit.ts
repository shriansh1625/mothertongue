/**
 * Tiny in-memory sliding-window rate limiter (single Node process on Render).
 * Keyed by the first x-forwarded-for entry, since Render sits behind a proxy.
 */
import { NextResponse } from "next/server";

const g = globalThis as unknown as { __mtrl?: Map<string, number[]> };

export function clientIp(req: Request): string {
  // Render appends the connecting client. The first value is whatever the caller sent, so it is not a limit key.
  const xff = req.headers.get("x-forwarded-for");
  const parts = xff?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return parts[parts.length - 1] || req.headers.get("x-real-ip") || "local";
}

/** Returns true if the request is allowed (and records it), false if over the limit. */
export function rateLimit(bucket: string, req: Request, limit: number, windowMs: number): boolean {
  const map = (g.__mtrl ??= new Map<string, number[]>());
  const key = `${bucket}:${clientIp(req)}`;
  const now = Date.now();
  const hits = (map.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    map.set(key, hits);
    return false;
  }
  hits.push(now);
  map.set(key, hits);
  // keep memory bounded
  if (map.size > 5000) {
    for (const [k, v] of map) {
      if (!v.length || now - v[v.length - 1] >= windowMs) map.delete(k);
    }
  }
  return true;
}

export function tooManyRequests(message = "You're going a little fast. Please wait a few minutes and try again.") {
  return NextResponse.json({ error: message }, { status: 429 });
}
