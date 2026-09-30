import { NextResponse } from "next/server";
import { searchStops, hasTransitKey } from "@/lib/transit";

/**
 * Stop search (keyed). GET /api/transit/search?q=<query> → { stops }
 * 503 { needsKey: true } when no Rejseplanen key is configured.
 */
export async function GET(request: Request) {
  if (!hasTransitKey()) {
    return NextResponse.json({ stops: [], needsKey: true, error: "No Rejseplanen API key configured." }, { status: 503 });
  }
  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (!q.trim()) return NextResponse.json({ stops: [] });
  const stops = await searchStops(q);
  return NextResponse.json({ stops });
}
