import { NextResponse } from "next/server";
import { runProbabilityEngine } from "@/lib/nhl-probability";

const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 15 * 60 * 1000; // 15 min (expensive to compute)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") ?? "division:pacific"; // division:X | conference:X | league
  const teams = searchParams.get("teams"); // comma-separated abbrevs, optional
  const gamesAhead = parseInt(searchParams.get("games") ?? "5");

  const cacheKey = `${scope}-${gamesAhead}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    // 1. Fetch current standings
    const standingsRes = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/nhl/standings`
    );
    const standingsData = await standingsRes.json();
    let standings = standingsData.standings ?? [];

    // Filter standings by scope
    if (scope.startsWith("division:")) {
      const div = scope.split(":")[1].toLowerCase();
      standings = standings.filter(
        (s: { division: string }) => s.division?.toLowerCase() === div
      );
    } else if (scope.startsWith("conference:")) {
      const conf = scope.split(":")[1].toLowerCase();
      standings = standings.filter(
        (s: { conference: string }) => s.conference?.toLowerCase() === conf
      );
    }
    // "league" = all teams

    // 2. Fetch upcoming games for all teams in scope
    const abbrevs: string[] = standings.map((s: { teamAbbrev: string }) => s.teamAbbrev);

    // Fetch the league schedule for the next ~2 weeks
    const scheduleRes = await fetch(
      "https://api-web.nhle.com/v1/schedule/now"
    );
    const scheduleData = scheduleRes.ok ? await scheduleRes.json() : { gameWeek: [] };

    // Collect games from the next N game-weeks
    const allGames: unknown[] = [];
    const weeks: unknown[] = scheduleData.gameWeek ?? [];
    for (const week of weeks.slice(0, Math.ceil(gamesAhead / 3) + 2)) {
      const weekData = week as { games: unknown[] };
      allGames.push(...(weekData.games ?? []));
    }

    // Filter to games involving teams in our scope and map to ScheduledGame
    const relevantGames = allGames
      .filter((g) => {
        const game = g as { homeTeam: { abbrev: string }; awayTeam: { abbrev: string }; gameState: string };
        return (
          (game.gameState === "FUT" || game.gameState === "PRE") &&
          (abbrevs.includes(game.homeTeam.abbrev) || abbrevs.includes(game.awayTeam.abbrev))
        );
      })
      .map((g) => {
        const game = g as {
          id: unknown;
          gameDate: string;
          homeTeam: { abbrev: string };
          awayTeam: { abbrev: string };
        };
        return {
          gameId: game.id,
          gameDate: game.gameDate,
          homeTeam: { abbrev: game.homeTeam.abbrev },
          awayTeam: { abbrev: game.awayTeam.abbrev },
        };
      });

    // Limit to games where each team plays at most `gamesAhead` games
    const teamGameCount = new Map<string, number>();
    const limitedGames = relevantGames.filter((g) => {
      const h = teamGameCount.get(g.homeTeam.abbrev) ?? 0;
      const a = teamGameCount.get(g.awayTeam.abbrev) ?? 0;
      if (h >= gamesAhead || a >= gamesAhead) return false;
      teamGameCount.set(g.homeTeam.abbrev, h + 1);
      teamGameCount.set(g.awayTeam.abbrev, a + 1);
      return true;
    });

    const targetTeams = teams ? teams.split(",").map((t) => t.trim().toUpperCase()) : undefined;

    const results = runProbabilityEngine(standings, limitedGames, targetTeams);

    const payload = { scope, gamesAhead, results };
    cache.set(cacheKey, { data: payload, ts: Date.now() });

    return NextResponse.json(payload);
  } catch (err) {
    console.error("Probability engine error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
