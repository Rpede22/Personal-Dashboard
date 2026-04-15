import { NextResponse } from "next/server";

const NHL_API = "https://api.nhle.com/stats/rest/en";
const STANDINGS_URL = "https://api-web.nhle.com/v1/standings/now";

// Cache is module-level so it resets on server restart
let cache: { data: unknown; ts: number } | null = null;
const TTL = 10 * 60 * 1000; // 10 minutes

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter"); // conference | division | team abbrev

  if (cache && Date.now() - cache.ts < TTL) {
    return NextResponse.json(filtered(cache.data, filter));
  }

  try {
    const res = await fetch(STANDINGS_URL, { next: { revalidate: 600 } });
    if (!res.ok) throw new Error(`NHL API ${res.status}`);
    const raw = await res.json();

    const standings = (raw.standings ?? []).map((s: Record<string, unknown>) => ({
      teamName: (s.teamName as Record<string,string>)?.default ?? (s.teamCommonName as Record<string,string>)?.default ?? String(s.teamCommonName ?? ""),
      teamAbbrev: (s.teamAbbrev as Record<string,string>)?.default ?? String(s.teamAbbrev ?? ""),
      conference: s.conferenceName,
      division: s.divisionName,
      points: s.points,
      gamesPlayed: s.gamesPlayed,
      wins: s.wins,
      losses: s.losses,
      otLosses: s.otLosses,
      regulationWins: s.regulationWins,
      divisionRank: s.divisionSequence,
      conferenceRank: s.conferenceSequence,
      leagueRank: s.leagueSequence,
      wildcardRank: s.wildcardSequence,
      streakCode: s.streakCode,
    }));

    cache = { data: { standings }, ts: Date.now() };
    return NextResponse.json(filtered(cache.data, filter));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

function filtered(data: unknown, filter: string | null) {
  const d = data as { standings: Record<string, unknown>[] };
  if (!filter) return d;

  const f = filter.toUpperCase();
  const byConference = ["EASTERN", "WESTERN"].includes(f);
  const byDivision = ["ATLANTIC", "METROPOLITAN", "CENTRAL", "PACIFIC"].includes(f);

  if (byConference) {
    return {
      standings: d.standings.filter(
        (s) => (s.conference as string)?.toUpperCase() === f
      ),
    };
  }
  if (byDivision) {
    return {
      standings: d.standings.filter(
        (s) => (s.division as string)?.toUpperCase() === f
      ),
    };
  }
  // Team abbrev filter
  return {
    standings: d.standings.filter((s) => s.teamAbbrev === f),
  };
}
