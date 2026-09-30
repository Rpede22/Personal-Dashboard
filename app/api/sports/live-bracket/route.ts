import { NextResponse } from "next/server";
import { getFollowedTeam, followedToTeamConfig } from "@/lib/followed-teams";
import { usSportFromEspnLeague } from "@/lib/playoff-rules";
import { fetchLiveBracket, type LiveBracket } from "@/lib/live-bracket";
import { espnFetchStandings } from "@/lib/espn";

/**
 * Live playoff bracket for a followed US team (NHL / NBA / NFL).
 *   GET /api/sports/live-bracket?slug=<team>[&year=YYYY]
 *     → LiveBracket (official NHL API for NHL; ESPN postseason reconstruction for
 *       NBA/NFL). `available:false` when there's no postseason to show — the hub
 *       then keeps the Projected bracket. `?year=` overrides the season (testing).
 *
 * Tries the current calendar year first, then the previous one, so during the
 * offseason it shows the most recent completed bracket rather than nothing.
 */

const cache = new Map<string, { data: LiveBracket; ts: number }>();
const TTL = 5 * 60 * 1000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug") ?? "";
  const yearParam = searchParams.get("year");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const followed = getFollowedTeam(slug);
  if (!followed) return NextResponse.json({ error: "unknown team" }, { status: 404 });
  const cfg = followedToTeamConfig(followed);
  const sport = usSportFromEspnLeague(cfg.espnLeague);
  if (!sport || !cfg.espnSport || !cfg.espnLeague) {
    return NextResponse.json({ available: false, error: "not a US team" }, { status: 200 });
  }
  const path = { sport: cfg.espnSport, league: cfg.espnLeague };

  const cacheKey = `${slug}-${yearParam ?? "auto"}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL) return NextResponse.json(cached.data);

  const now = new Date();
  const years = yearParam ? [Number(yearParam)] : [now.getFullYear(), now.getFullYear() - 1];

  let result: LiveBracket = { available: false, sport, season: years[0], rounds: [] };
  for (const y of years) {
    if (!Number.isFinite(y)) continue;
    const b = await fetchLiveBracket(sport, path, y);
    if (b.available) { result = b; break; }
  }

  // Resolve the followed team's ESPN abbreviation (so the widget can find "its"
  // series) by matching the team's keyword against the current standings.
  if (result.available) {
    try {
      const rows = await espnFetchStandings(path);
      const kw = cfg.matchKeyword.toLowerCase();
      const mine = rows.find((r) => r.name.toLowerCase().includes(kw));
      if (mine) result = { ...result, myAbbr: mine.abbr };
    } catch { /* abbr is optional */ }
  }

  cache.set(cacheKey, { data: result, ts: Date.now() });
  return NextResponse.json(result);
}
