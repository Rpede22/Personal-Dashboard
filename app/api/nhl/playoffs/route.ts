import { NextResponse } from "next/server";

const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 15 * 60 * 1000; // 15 minutes

interface PlayoffTeam {
  seed: number;
  teamAbbrev: string;
  teamName: string;
  points: number;
  division: string;
  type: "division-winner" | "2nd" | "3rd" | "wildcard";
}

interface Matchup {
  seed1: number;
  team1: string;
  team1Name: string;
  pts1: number;
  seed2: number;
  team2: string;
  team2Name: string;
  pts2: number;
  homeWinProbability: number; // probability seed1 wins
  division: string;
}

interface ConferenceResult {
  matchups: Matchup[];
  playoffTeams: PlayoffTeam[];
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function computeHomeWinProb(
  home: { ptsPct: number; regWinRate: number },
  away: { ptsPct: number; regWinRate: number }
): number {
  return clamp(
    0.54 +
      (home.ptsPct - away.ptsPct) * 0.3 +
      (home.regWinRate - away.regWinRate) * 0.2,
    0.3,
    0.75
  );
}

function buildConference(
  conference: string,
  standings: any[]
): ConferenceResult {
  const confTeams = standings.filter(
    (s) => s.conference?.toLowerCase() === conference.toLowerCase()
  );

  // Group by division
  const byDivision = new Map<string, any[]>();
  for (const team of confTeams) {
    const div = team.division ?? "Unknown";
    if (!byDivision.has(div)) byDivision.set(div, []);
    byDivision.get(div)!.push(team);
  }

  // Sort each division by divisionRank (or points desc as fallback)
  for (const [div, teams] of byDivision) {
    byDivision.set(
      div,
      teams.sort((a, b) => {
        if (a.divisionRank != null && b.divisionRank != null) {
          return a.divisionRank - b.divisionRank;
        }
        return b.points - a.points;
      })
    );
  }

  const divisions = Array.from(byDivision.keys());
  if (divisions.length < 2) {
    // Fallback: not enough divisions — return empty
    return { matchups: [], playoffTeams: [] };
  }

  // Identify division 1 and division 2 (div with more pts in 1st place = "div1")
  const [divA, divB] = divisions;
  const divATeams = byDivision.get(divA)!;
  const divBTeams = byDivision.get(divB)!;

  const divAWinnerPts = divATeams[0]?.points ?? 0;
  const divBWinnerPts = divBTeams[0]?.points ?? 0;

  // div1 = division winner with MORE points (seed 1's division)
  const [div1Teams, div2Teams, div1Name, div2Name] =
    divAWinnerPts >= divBWinnerPts
      ? [divATeams, divBTeams, divA, divB]
      : [divBTeams, divATeams, divB, divA];

  // Top 3 from each division
  const div1Top3 = div1Teams.slice(0, 3);
  const div2Top3 = div2Teams.slice(0, 3);

  // Wildcards: best non-top-3 teams from the conference by points
  const nonTop3 = confTeams.filter(
    (t) =>
      !div1Top3.some((d) => d.teamAbbrev === t.teamAbbrev) &&
      !div2Top3.some((d) => d.teamAbbrev === t.teamAbbrev)
  );
  nonTop3.sort((a, b) => b.points - a.points);
  const wildcards = nonTop3.slice(0, 2);

  // NHL seeding per conference:
  // Seed 1 = div1 winner (more pts), Seed 2 = div2 winner
  // Seed 3 = div1 2nd place, Seed 4 = div2 2nd place
  // Seed 5 = div2 3rd place, Seed 6 = div1 3rd place
  // Seed 7 = wildcard with more pts, Seed 8 = wildcard with fewer pts
  const playoffTeams: PlayoffTeam[] = ([
    { seed: 1, ...toTeam(div1Top3[0]), division: div1Name, type: "division-winner" as const },
    { seed: 2, ...toTeam(div2Top3[0]), division: div2Name, type: "division-winner" as const },
    { seed: 3, ...toTeam(div1Top3[1]), division: div1Name, type: "2nd" as const },
    { seed: 4, ...toTeam(div2Top3[1]), division: div2Name, type: "2nd" as const },
    { seed: 5, ...toTeam(div2Top3[2]), division: div2Name, type: "3rd" as const },
    { seed: 6, ...toTeam(div1Top3[2]), division: div1Name, type: "3rd" as const },
    { seed: 7, ...toTeam(wildcards[0]), division: "Wildcard", type: "wildcard" as const },
    { seed: 8, ...toTeam(wildcards[1]), division: "Wildcard", type: "wildcard" as const },
  ] as PlayoffTeam[]).filter((t) => t.teamAbbrev); // drop any undefined slots

  // Build teamStats for probability calculations
  const teamStatsMap = new Map(
    confTeams.map((s) => [
      s.teamAbbrev,
      {
        ptsPct: s.gamesPlayed > 0 ? s.points / (s.gamesPlayed * 2) : 0.5,
        regWinRate: s.gamesPlayed > 0 ? s.regulationWins / s.gamesPlayed : 0.4,
      },
    ])
  );

  // First round: (1)v(8), (2)v(7), (3)v(6), (4)v(5)
  const pairs: [number, number][] = [
    [1, 8],
    [2, 7],
    [3, 6],
    [4, 5],
  ];

  const matchups: Matchup[] = [];
  for (const [s1, s2] of pairs) {
    const t1 = playoffTeams.find((t) => t.seed === s1);
    const t2 = playoffTeams.find((t) => t.seed === s2);
    if (!t1 || !t2) continue;

    const homeStats = teamStatsMap.get(t1.teamAbbrev) ?? { ptsPct: 0.5, regWinRate: 0.4 };
    const awayStats = teamStatsMap.get(t2.teamAbbrev) ?? { ptsPct: 0.5, regWinRate: 0.4 };

    matchups.push({
      seed1: s1,
      team1: t1.teamAbbrev,
      team1Name: t1.teamName,
      pts1: t1.points,
      seed2: s2,
      team2: t2.teamAbbrev,
      team2Name: t2.teamName,
      pts2: t2.points,
      homeWinProbability: computeHomeWinProb(homeStats, awayStats),
      division: s1 <= 2 ? "Division Finals" : `${t1.division} vs ${t2.division}`,
    });
  }

  return { matchups, playoffTeams };
}

function toTeam(
  s: any
): { teamAbbrev: string; teamName: string; points: number } {
  return {
    teamAbbrev: s?.teamAbbrev ?? "",
    teamName: s?.teamName ?? "",
    points: s?.points ?? 0,
  };
}

export async function GET() {
  const cacheKey = "playoffs";
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const standingsRes = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/nhl/standings`
    );
    if (!standingsRes.ok) throw new Error(`Standings fetch failed: ${standingsRes.status}`);
    const standingsData = await standingsRes.json();
    const standings: any[] = standingsData.standings ?? [];

    const western = buildConference("Western", standings);
    const eastern = buildConference("Eastern", standings);

    const payload = { western, eastern };
    cache.set(cacheKey, { data: payload, ts: Date.now() });
    return NextResponse.json(payload);
  } catch (err) {
    console.error("Playoffs route error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
