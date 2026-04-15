/**
 * NHL Standings Probability Engine
 *
 * Uses Monte Carlo simulation to calculate the probability distribution
 * of standings positions after N upcoming games.
 *
 * Each game has 3 outcomes:
 *   - Regulation win: winner +2pts, loser +0pts
 *   - OT/SO win:      winner +2pts, loser +1pt
 *   - Regulation loss: same as win for the other team
 *
 * Weights: W=1/3, OTL=1/3, L=1/3 (equal probability)
 * We model each game as having outcomes from BOTH teams' perspectives.
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
const OUTCOMES = [
  { homeGain: 2, awayGain: 0 },  // Home wins regulation
  { homeGain: 2, awayGain: 1 },  // Home wins OT/SO
  { homeGain: 1, awayGain: 2 },  // Away wins OT/SO
  { homeGain: 0, awayGain: 2 },  // Away wins regulation
] as const;

// Equal weight: reg-W, OTL-W, OTL-L, reg-L = 25% each
// But to match real NHL distribution (roughly): reg-W 42%, OTW 8%, OTL 8%, reg-L 42%
// Simplified to 3 types: regW, OT (either), regL = 1/3 each
// OT splits 50/50 for who wins OT
const OUTCOME_WEIGHTS = [0.375, 0.125, 0.125, 0.375]; // sum = 1.0

function pickOutcome(): (typeof OUTCOMES)[number] {
  const r = Math.random();
  let cumulative = 0;
  for (let i = 0; i < OUTCOMES.length; i++) {
    cumulative += OUTCOME_WEIGHTS[i];
    if (r < cumulative) return OUTCOMES[i];
  }
  return OUTCOMES[3];
}

export function runProbabilityEngine(
  currentStandings: TeamStanding[],
  upcomingGames: ScheduledGame[],
  targetTeams?: string[] // if provided, only return results for these teams
): ProbabilityResult[] {
  const teams = new Map<string, TeamStanding>(
    currentStandings.map((s) => [s.teamAbbrev, { ...s }])
  );

  // Only simulate games where at least one team is in our standings
  const relevantGames = upcomingGames.filter(
    (g) => teams.has(g.homeTeam.abbrev) || teams.has(g.awayTeam.abbrev)
  );

  // Track results per team across simulations
  const pointsAccumulator = new Map<string, number[]>(); // abbrev -> array of final points per sim
  teams.forEach((_, abbrev) => pointsAccumulator.set(abbrev, []));

  // Run simulations
  for (let sim = 0; sim < SIMULATIONS; sim++) {
    // Start from current points
    const simPoints = new Map<string, number>();
    teams.forEach((s, abbrev) => simPoints.set(abbrev, s.points));

    for (const game of relevantGames) {
      const outcome = pickOutcome();
      const home = game.homeTeam.abbrev;
      const away = game.awayTeam.abbrev;

      if (simPoints.has(home)) {
        simPoints.set(home, simPoints.get(home)! + outcome.homeGain);
      }
      if (simPoints.has(away)) {
        simPoints.set(away, simPoints.get(away)! + outcome.awayGain);
      }
    }

    // Record final points for each team
    simPoints.forEach((pts, abbrev) => {
      pointsAccumulator.get(abbrev)?.push(pts);
    });
  }

  // Build results
  const results: ProbabilityResult[] = [];
  const teamList = targetTeams
    ? Array.from(teams.values()).filter((t) => targetTeams.includes(t.teamAbbrev))
    : Array.from(teams.values());

  // For division/conference rank, we need to compute rank distributions
  // Group teams by division and conference
  const divisionTeams = new Map<string, string[]>();
  const conferenceTeams = new Map<string, string[]>();
  teams.forEach((t, abbrev) => {
    if (!divisionTeams.has(t.division)) divisionTeams.set(t.division, []);
    divisionTeams.get(t.division)!.push(abbrev);
    if (!conferenceTeams.has(t.conference)) conferenceTeams.set(t.conference, []);
    conferenceTeams.get(t.conference)!.push(abbrev);
  });

  // Compute rank distributions (expensive but worth it)
  // Build per-simulation rank data
  const divRankAccumulator = new Map<string, number[]>();
  const confRankAccumulator = new Map<string, number[]>();
  teams.forEach((_, abbrev) => {
    divRankAccumulator.set(abbrev, []);
    confRankAccumulator.set(abbrev, []);
  });

  // Rebuild simulation results for ranking
  for (let sim = 0; sim < SIMULATIONS; sim++) {
    const simPoints = new Map<string, number>();
    teams.forEach((s, abbrev) => simPoints.set(abbrev, s.points));

    for (const game of relevantGames) {
      const outcome = pickOutcome();
      const home = game.homeTeam.abbrev;
      const away = game.awayTeam.abbrev;
      if (simPoints.has(home)) simPoints.set(home, simPoints.get(home)! + outcome.homeGain);
      if (simPoints.has(away)) simPoints.set(away, simPoints.get(away)! + outcome.awayGain);
    }

    // Compute division ranks
    divisionTeams.forEach((divAbbrevs, _div) => {
      const sorted = [...divAbbrevs].sort(
        (a, b) => (simPoints.get(b) ?? 0) - (simPoints.get(a) ?? 0)
      );
      sorted.forEach((abbrev, idx) => {
        divRankAccumulator.get(abbrev)?.push(idx + 1);
      });
    });

    // Compute conference ranks
    conferenceTeams.forEach((confAbbrevs, _conf) => {
      const sorted = [...confAbbrevs].sort(
        (a, b) => (simPoints.get(b) ?? 0) - (simPoints.get(a) ?? 0)
      );
      sorted.forEach((abbrev, idx) => {
        confRankAccumulator.get(abbrev)?.push(idx + 1);
      });
    });
  }

  for (const team of teamList) {
    const abbrev = team.teamAbbrev;
    const simPts = pointsAccumulator.get(abbrev) ?? [];
    const divRanks = divRankAccumulator.get(abbrev) ?? [];
    const confRanks = confRankAccumulator.get(abbrev) ?? [];

    // Points distribution
    const pointsDist: Record<number, number> = {};
    simPts.forEach((p) => {
      pointsDist[p] = (pointsDist[p] ?? 0) + 1 / SIMULATIONS;
    });

    // Division rank distribution
    const divDist: Record<number, number> = {};
    divRanks.forEach((r) => {
      divDist[r] = (divDist[r] ?? 0) + 1 / SIMULATIONS;
    });

    // Conference rank distribution
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
