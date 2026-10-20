import { NextResponse } from "next/server";
import { mlFetchMatchDetail } from "@/lib/metalligaen";

/**
 * Goals + penalties for one Metal Ligaen game — backs the last-5 dropdown for
 * followed Danish hockey teams (Esbjerg Energy et al.). GET ?id=<metalMatchId>
 * → { overtime, shootout, goals[], penalties[] }.
 *
 * `id` is the Metal Ligaen game id carried on each SportsEvent.metalMatchId.
 * Data comes from the widget JSON the metalligaen.dk match page itself uses
 * (den.hokejovyzapis.cz). 1 h in-memory cache per game (finished games are
 * immutable; a live game is at worst an hour stale).
 */

const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 60 * 60 * 1000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const cached = cache.get(id);
  if (cached && Date.now() - cached.ts < TTL) return NextResponse.json(cached.data);

  const detail = await mlFetchMatchDetail(id);
  if (!detail) return NextResponse.json({ error: "unavailable", goals: [], penalties: [] }, { status: 502 });

  cache.set(id, { data: detail, ts: Date.now() });
  return NextResponse.json(detail);
}
