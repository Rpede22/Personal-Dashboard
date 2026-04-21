import { NextResponse } from "next/server";

// Cache per team
const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 5 * 60 * 1000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const team = (searchParams.get("team") ?? "EDM").toUpperCase();

  const cached = cache.get(team);
  if (cached && Date.now() - cached.ts < TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    // Fetch last 5 + next 5 games for the team
    // Use month/now (not week/now) so playoffs with sparse scheduling still return 4-5 upcoming games
    const [recentRes, upcomingRes] = await Promise.all([
      fetch(`https://api-web.nhle.com/v1/club-schedule-season/${team}/now`),
      fetch(`https://api-web.nhle.com/v1/club-schedule/${team}/month/now`),
    ]);

    const [recentData, upcomingData] = await Promise.all([
      recentRes.ok ? recentRes.json() : { games: [] },
      upcomingRes.ok ? upcomingRes.json() : { games: [] },
    ]);

    // Recent = completed games from season schedule, take last 5
    const allGames: Record<string, unknown>[] = recentData.games ?? [];
    const completed = allGames
      .filter((g) => g.gameState === "OFF" || g.gameState === "FINAL")
      .slice(-5)
      .map(mapGame);

    // Upcoming = scheduled games
    const upcoming: Record<string, unknown>[] = upcomingData.games ?? [];
    const next5 = upcoming
      .filter((g) => g.gameState === "FUT" || g.gameState === "PRE")
      .slice(0, 5)
      .map(mapGame);

    const payload = {
      team,
      recent: completed,
      next: next5[0] ?? null,
      next5,
    };

    cache.set(team, { data: payload, ts: Date.now() });
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

function mapGame(g: Record<string, unknown>) {
  const home = g.homeTeam as Record<string, unknown>;
  const away = g.awayTeam as Record<string, unknown>;
  return {
    gameId: g.id,
    gameDate: g.gameDate,
    startTimeUTC: g.startTimeUTC,
    gameState: g.gameState,
    venue: (g.venue as Record<string, string>)?.default,
    periodType: (g.periodDescriptor as any)?.periodType ?? null,
    gameOutcome: g.gameOutcome,
    homeTeam: {
      abbrev: home?.abbrev,
      name: (home?.name as Record<string, string>)?.default,
      score: home?.score,
    },
    awayTeam: {
      abbrev: away?.abbrev,
      name: (away?.name as Record<string, string>)?.default,
      score: away?.score,
    },
  };
}
