import { NextResponse } from "next/server";
import { getFollowedTeam } from "@/lib/followed-teams";
import { espnFetchGameScoring } from "@/lib/espn";

/**
 * Scoring plays for one completed ESPN game — backs the last-5 dropdown for
 * followed US teams (NHL / NFL). GET ?team=<slug>&event=<espnEventId> →
 * { plays: [{ period, clock, text, homeScore, awayScore }] }.
 *
 * Keyed off the followed team's espnSport/espnLeague (so it 404s a non-ESPN or
 * unfollowed slug). NBA is intentionally not surfaced (too many scoring plays).
 * 1 h in-memory cache per event.
 */

const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 60 * 60 * 1000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("team");
  const event = searchParams.get("event");
  if (!slug || !event) return NextResponse.json({ error: "missing team or event" }, { status: 400 });

  const followed = getFollowedTeam(slug);
  if (!followed) return NextResponse.json({ error: "unknown team" }, { status: 404 });
  if (!followed.espnSport || !followed.espnLeague || followed.espnLeague === "nba") {
    return NextResponse.json({ plays: [] });
  }

  const cacheKey = `${followed.espnSport}-${followed.espnLeague}-${event}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL) return NextResponse.json(cached.data);

  const plays = await espnFetchGameScoring({ sport: followed.espnSport, league: followed.espnLeague }, event);
  const payload = { plays };
  cache.set(cacheKey, { data: payload, ts: Date.now() });
  return NextResponse.json(payload);
}
