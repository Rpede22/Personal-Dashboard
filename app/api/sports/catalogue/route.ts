import { NextResponse } from "next/server";
import { CATALOGUE_LEAGUES, getCatalogueLeague } from "@/lib/sports-catalogue";
import { fmFetchLeague } from "@/lib/fotmob";
import { mlFetchStandings } from "@/lib/metalligaen";
import { espnFetchStandings } from "@/lib/espn";

/**
 * GET /api/sports/catalogue            → the league list for the picker.
 * GET /api/sports/catalogue?league=ID  → that league's teams, fetched LIVE
 *   from its current standings (so there are no hardcoded team IDs to rot).
 *
 * Each team row is `{ name, matchKeyword, fotmobTeamId? }` — enough for the
 * settings panel to build a FollowedTeam entry. 30 min in-memory cache per
 * league so opening the picker repeatedly doesn't hammer the providers.
 */

const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 30 * 60 * 1000;

interface CatalogueTeam {
  name: string;
  matchKeyword: string;
  fotmobTeamId?: number;
  espnTeamId?: string;
}

export async function GET(request: Request) {
  const leagueId = new URL(request.url).searchParams.get("league");

  if (!leagueId) {
    return NextResponse.json({
      leagues: CATALOGUE_LEAGUES.map(({ id, label, country, sport, emoji }) => ({
        id, label, country, sport, emoji,
      })),
    });
  }

  const league = getCatalogueLeague(leagueId);
  if (!league) {
    return NextResponse.json({ error: `Unknown league "${leagueId}"` }, { status: 404 });
  }

  const cacheKey = `teams-${leagueId}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL) return NextResponse.json(cached.data);

  let teams: CatalogueTeam[] = [];
  try {
    if (league.provider === "fotmob" && league.fotmobLeagueId) {
      const fm = await fmFetchLeague(league.fotmobLeagueId);
      if (fm) {
        // Merge the main table with any split sub-tables so every team in the
        // league is offered even after the Danish leagues split post round 22.
        const rows = [...fm.mainTable, ...fm.subTables.flatMap((t) => t.rows)];
        const seen = new Set<string>();
        teams = rows
          .filter((r) => (seen.has(r.team) ? false : (seen.add(r.team), true)))
          .map((r) => ({
            name: r.team,
            matchKeyword: r.team,
            fotmobTeamId: r.teamId ? Number(r.teamId) : undefined,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }
    } else if (league.provider === "metalligaen") {
      const standings = await mlFetchStandings();
      teams = standings
        .map((r) => ({ name: r.team, matchKeyword: r.team }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } else if (league.provider === "espn" && league.espnSport && league.espnLeague) {
      const rows = await espnFetchStandings({ sport: league.espnSport, league: league.espnLeague });
      teams = rows
        .map((r) => ({ name: r.name, matchKeyword: r.name, espnTeamId: r.teamId }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  } catch {
    teams = [];
  }

  const payload = { league: { id: league.id, label: league.label, sport: league.sport }, teams };
  cache.set(cacheKey, { data: payload, ts: Date.now() });
  return NextResponse.json(payload);
}
