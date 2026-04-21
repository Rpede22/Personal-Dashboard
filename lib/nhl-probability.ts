/**
 * NHL Standings Probability Engine
 *
 * Uses Monte Carlo simulation with weighted per-game probabilities to calculate
 * the probability distribution of standings positions after N upcoming games.
 *
 * Per-game win probability (from home team's perspective):
 *   homeWinProb = clamp(0.54 + ptsPctAdjust + regWinAdjust, 0.28, 0.78)
 *   ptsPctAdjust  = (homePtsPct - awayPtsPct) * 0.3
 *   regWinAdjust  = (homeRegWinRate - awayRegWinRate) * 0.2
 *
 * Outcome probabilities from home team perspective:
 *   regWin  = homeWinProb * 0.76
 *   otWin   = homeWinProb * 0.24
 *   otLoss  = (1 - homeWinProb) * 0.24
 *   regLoss = (1 - homeWinProb) * 0.76
 */

export interface TeamStanding {
  teamAbbrev: string;
  teamName: string;
  conference: string;
  division: string;
  points: number;
  gamesPlayed: number;
  wins: number;
  regulationWins: number;
}

export interface ScheduledGame {
  gameId: unknown;
  gameDate: string;
  homeTeam: { abbrev: string };
  awayTeam: { abbrev: string };
}

export interface ProbabilityResult {
  teamAbbrev: string;
  teamName: string;
  currentPoints: number;
  division: string;
  conference: string;
  // Probability of each final points total (after N games)
  pointsDistribution: Record<number, number>; // points -> probability (0-1)
  // Probability of each division rank
  divisionRankDistribution: Record<number, number>; // rank -> probability
  // Probability of each conference rank
  conferenceRankDistribution: Record<number, number>;
  // Expected (mean) points after N games
  expectedPoints: number;
  // Most likely division rank
  mostLikelyDivRank: number;
  // Games simulated
  gamesAhead: number;
}

const SIMULATIONS = 20000;

// Outcomes from home team perspective: [homeGain, awayGain]
const OUTCOMES = [
  { homeGain: 2, awayGain: 0 },  // Home wins regulation
  { homeGain: 2, awayGain: 1 },  // Home wins OT/SO
  { homeGain: 1, awayGain: 2 },  // Away wins OT/SO
  { homeGain: 0, awayGain: 2 },  // Away wins regulation
] as const;

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function pickOutcomeWeighted(homeWinProb: number): (typeof OUTCOMES)[number] {
  // regWin  = homeWinProb * 0.76
  // otWin   = homeWinProb * 0.24
  // otLoss  = (1 - homeWinProb) * 0.24
  // regLoss = (1 - homeWinProb) * 0.76
  const weights = [
    homeWinProb * 0.76,
    homeWinProb * 0.24,
    (1 - homeWinProb) * 0.24,
    (1 - homeWinProb) * 0.76,
  ];
  const r = Math.random();
  let cumulative = 0;
  for (let i = 0; i < OUTCOMES.length; i++) {
    cumulative += weights[i];
    if (r < cumulative) return OUTCOMES[i];
  }
  return OUTCOMES[3];
}

function computeHomeWinProb(
  homeAbbrev: string,
  awayAbbrev: string,
  teamStats: Map<string, { ptsPct: number; regWinRate: number }>
): number {
  const homeStats = teamStats.get(homeAbbrev);
  const awayStats = teamStats.get(awayAbbrev);
  const homePtsPct = homeStats?.ptsPct ?? 0.5;
  const awayPtsPct = awayStats?.ptsPct ?? 0.5;
  const homeRegWinRate = homeStats?.regWinRate ?? 0.4;
  const awayRegWinRate = awayStats?.regWinRate ?? 0.4;

  const ptsPctAdjust = (homePtsPct - awayPtsPct) * 0.3;
  const regWinAdjust = (homeRegWinRate - awayRegWinRate) * 0.2;

  return clamp(0.54 + ptsPctAdjust + regWinAdjust, 0.28, 0.78);
}

export function runProbabilityEngine(
  currentStandings: TeamStanding[],
  upcomingGames: ScheduledGame[],
  targetTeams?: string[], // if provided, only return results for these teams
  teamStats?: Map<string, { ptsPct: number; regWinRate: number }>
): ProbabilityResult[] {
  const teams = new Map<string, TeamStanding>(
    currentStandings.map((s) => [s.teamAbbrev, { ...s }])
  );

  // Build default teamStats from standings if not provided
  const stats: Map<string, { ptsPct: number; regWinRate: number }> =
    teamStats ??
    new Map(
      currentStandings.map((s) => [
        s.teamAbbrev,
        {
          ptsPct: s.gamesPlayed > 0 ? s.points / (s.gamesPlayed * 2) : 0.5,
          regWinRate: s.gamesPlayed > 0 ? s.regulationWins / s.gamesPlayed : 0.4,
        },
      ])
    );

  // Only simulate games where at least one team is in our standings
  const relevantGames = upcomingGames.filter(
    (g) => teams.has(g.homeTeam.abbrev) || teams.has(g.awayTeam.abbrev)
  );

  // Pre-compute per-game home win probabilities
  const gameProbs = relevantGames.map((g) =>
    computeHomeWinProb(g.homeTeam.abbrev, g.awayTeam.abbrev, stats)
  );

  // Track results per team across simulations
  const pointsAccumulator = new Map<string, number[]>();
  teams.forEach((_, abbrev) => pointsAccumulator.set(abbrev, []));

  // Group teams by division and conference for rank computation
  const divisionTeams = new Map<string, string[]>();
  const conferenceTeams = new Map<string, string[]>();
  teams.forEach((t, abbrev) => {
    if (!divisionTeams.has(t.division)) divisionTeams.set(t.division, []);
    divisionTeams.get(t.division)!.push(abbrev);
    if (!conferenceTeams.has(t.conference)) conferenceTeams.set(t.conference, []);
    conferenceTeams.get(t.conference)!.push(abbrev);
  });

  const divRankAccumulator = new Map<string, number[]>();
  const confRankAccumulator = new Map<string, number[]>();
  teams.forEach((_, abbrev) => {
    divRankAccumulator.set(abbrev, []);
    confRankAccumulator.set(abbrev, []);
  });

  // Run simulations
  for (let sim = 0; sim < SIMULATIONS; sim++) {
    const simPoints = new Map<string, number>();
    teams.forEach((s, abbrev) => simPoints.set(abbrev, s.points));

    for (let gi = 0; gi < relevantGames.length; gi++) {
      const game = relevantGames[gi];
      const outcome = pickOutcomeWeighted(gameProbs[gi]);
      const home = game.homeTeam.abbrev;
      const away = game.awayTeam.abbrev;

      if (simPoints.has(home)) {
        simPoints.set(home, simPoints.get(home)! + outcome.homeGain);
      }
      if (simPoints.has(away)) {
        simPoints.set(away, simPoints.get(away)! + outcome.awayGain);
      }
    }

    // Record final points
    simPoints.forEach((pts, abbrev) => {
      pointsAccumulator.get(abbrev)?.push(pts);
    });

    // Compute division ranks (tiebreaker: regulation wins, then team abbrev)
    divisionTeams.forEach((divAbbrevs) => {
      const sorted = [...divAbbrevs].sort((a, b) => {
        const ptsDiff = (simPoints.get(b) ?? 0) - (simPoints.get(a) ?? 0);
        if (ptsDiff !== 0) return ptsDiff;
        const rwDiff = (teams.get(b)?.regulationWins ?? 0) - (teams.get(a)?.regulationWins ?? 0);
        if (rwDiff !== 0) return rwDiff;
        return a.localeCompare(b);
      });
      sorted.forEach((abbrev, idx) => {
        divRankAccumulator.get(abbrev)?.push(idx + 1);
      });
    });

    // Compute conference ranks (same tiebreaker)
    conferenceTeams.forEach((confAbbrevs) => {
      const sorted = [...confAbbrevs].sort((a, b) => {
        const ptsDiff = (simPoints.get(b) ?? 0) - (simPoints.get(a) ?? 0);
        if (ptsDiff !== 0) return ptsDiff;
        const rwDiff = (teams.get(b)?.regulationWins ?? 0) - (teams.get(a)?.regulationWins ?? 0);
        if (rwDiff !== 0) return rwDiff;
        return a.localeCompare(b);
      });
      sorted.forEach((abbrev, idx) => {
        confRankAccumulator.get(abbrev)?.push(idx + 1);
      });
    });
  }

  // Build results
  const teamList = targetTeams
    ? Array.from(teams.values()).filter((t) => targetTeams.includes(t.teamAbbrev))
    : Array.from(teams.values());

  const results: ProbabilityResult[] = [];

  for (const team of teamList) {
    const abbrev = team.teamAbbrev;
    const simPts = pointsAccumulator.get(abbrev) ?? [];
    const divRanks = divRankAccumulator.get(abbrev) ?? [];
    const confRanks = confRankAccumulator.get(abbrev) ?? [];

    const pointsDist: Record<number, number> = {};
    simPts.forEach((p) => {
      pointsDist[p] = (pointsDist[p] ?? 0) + 1 / SIMULATIONS;
    });

    const divDist: Record<number, number> = {};
    divRanks.forEach((r) => {
      divDist[r] = (divDist[r] ?? 0) + 1 / SIMULATIONS;
    });

    const confDist: Record<number, number> = {};
    confRanks.forEach((r) => {
      confDist[r] = (confDist[r] ?? 0) + 1 / SIMULATIONS;
    });

    const expectedPoints = simPts.reduce((a, b) => a + b, 0) / SIMULATIONS;
    const mostLikelyDivRank = Object.entries(divDist).sort(
      ([, a], [, b]) => b - a
    )[0]?.[0];

    results.push({
      teamAbbrev: abbrev,
      teamName: team.teamName,
      currentPoints: team.points,
      division: team.division,
      conference: team.conference,
      pointsDistribution: pointsDist,
      divisionRankDistribution: divDist,
      conferenceRankDistribution: confDist,
      expectedPoints,
      mostLikelyDivRank: parseInt(mostLikelyDivRank ?? "1"),
      gamesAhead: relevantGames.filter(
        (g) => g.homeTeam.abbrev === abbrev || g.awayTeam.abbrev === abbrev
      ).length,
    });
  }

  return results.sort((a, b) => b.expectedPoints - a.expectedPoints);
}
