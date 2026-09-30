/**
 * Per-sport playoff rules for the US majors (NHL / NBA / NFL), plus the generic
 * "playoff race" math (magic number / elimination number / cutoff margin) that
 * drives the parameterized `SportsPlayoffRace` strip and the projected bracket.
 *
 * The three sports genuinely differ — the cutoff, seeding, bracket size and
 * whether wins or points decide the table all branch on sport — so everything
 * reads from `PLAYOFF_RULES` instead of hardcoding NHL assumptions. Client-safe
 * (pure functions, no `fs`/`fetch`).
 */

export type UsSport = "nhl" | "nba" | "nfl";

export interface PlayoffRules {
  sport: UsSport;
  label: string;             // "Stanley Cup Playoffs" etc.
  gamesInSeason: number;     // regular-season length (NHL/NBA 82, NFL 17)
  pointsPerWin: number;      // NHL 2 (standings points), NBA/NFL 1 (a win)
  usesPoints: boolean;       // NHL ranks by points; NBA/NFL by win%
  directSpots: number;       // guaranteed berths per conference (before any play-in)
  postseasonSpots: number;   // teams reaching the postseason per conference (incl. play-in)
  playIn?: { from: number; to: number }; // NBA: seeds 7..10 contest the last 2 berths
  byes: number;              // first-round byes per conference (NFL 1)
  bracketSeeds: number;      // seeds drawn into the main bracket per conference (NHL/NBA 8, NFL 7)
}

export const PLAYOFF_RULES: Record<UsSport, PlayoffRules> = {
  nhl: {
    sport: "nhl", label: "Stanley Cup Playoffs", gamesInSeason: 82,
    pointsPerWin: 2, usesPoints: true,
    directSpots: 8, postseasonSpots: 8, byes: 0, bracketSeeds: 8,
  },
  nba: {
    sport: "nba", label: "NBA Playoffs", gamesInSeason: 82,
    pointsPerWin: 1, usesPoints: false,
    directSpots: 6, postseasonSpots: 10, playIn: { from: 7, to: 10 }, byes: 0, bracketSeeds: 8,
  },
  nfl: {
    sport: "nfl", label: "NFL Playoffs", gamesInSeason: 17,
    pointsPerWin: 1, usesPoints: false,
    directSpots: 7, postseasonSpots: 7, byes: 1, bracketSeeds: 7,
  },
};

/** Map an ESPN league slug (or a followed-team `sport`) to a US sport key. */
export function usSportFromEspnLeague(league?: string | null): UsSport | null {
  if (league === "nhl" || league === "nba" || league === "nfl") return league;
  return null;
}

// ── Playoff-race math ──────────────────────────────────────────────────────────

export interface RaceTeam {
  rank: number;      // rank within the conference (1-based)
  team: string;
  abbr?: string;
  score: number;     // standings points (NHL) or wins (NBA/NFL)
  played: number;
}

export interface RaceResult {
  rank: number;
  score: number;
  gamesRemaining: number;
  maxScore: number;
  // Margin vs the last team currently holding a postseason berth (the cutoff),
  // and vs the first team on the outside.
  cutoffTeam: RaceTeam | null;
  firstOutTeam: RaceTeam | null;
  marginToCutoff: number | null;   // my score − cutoff score (positive = safe)
  magicNumber: number | null;      // score I must add to guarantee I clear the first-out team
  eliminationNumber: number | null;// score the cutoff team must add for me to fall out
  clinched: boolean;
  eliminated: boolean;
  status: "clinched" | "eliminated" | "in-the-race";
}

/**
 * Compute the playoff race for one team against its conference field.
 * `conferenceRows` must be the team's conference, ranked (rank 1 = top seed).
 * Generic across sports via `rules.pointsPerWin` + `rules.postseasonSpots`.
 */
export function computeRace(
  me: RaceTeam,
  conferenceRows: RaceTeam[],
  rules: PlayoffRules,
): RaceResult {
  const gamesRemaining = Math.max(0, rules.gamesInSeason - me.played);
  const maxScore = me.score + gamesRemaining * rules.pointsPerWin;

  const sorted = conferenceRows.slice().sort((a, b) => a.rank - b.rank);
  // The cutoff = the last team currently in (postseasonSpots-th). The first-out
  // team is the one immediately below it.
  const cutoffTeam = sorted.find((t) => t.rank === rules.postseasonSpots) ?? null;
  const firstOutTeam = sorted.find((t) => t.rank === rules.postseasonSpots + 1) ?? null;

  const maxOf = (t: RaceTeam) => t.score + Math.max(0, rules.gamesInSeason - t.played) * rules.pointsPerWin;

  // Magic number vs the first-out team: score I must add so they can't catch me
  // (own gains + their losses, counted in score units).
  const magicNumber = firstOutTeam
    ? Math.max(0, maxOf(firstOutTeam) - me.score + 1)
    : null;

  // Elimination number: score the cutoff team must add so I can't catch them
  // even winning out.
  const eliminationNumber = cutoffTeam
    ? Math.max(0, maxScore - cutoffTeam.score + 1)
    : null;

  const marginToCutoff = cutoffTeam ? me.score - cutoffTeam.score : null;

  // Already inside the postseason line and mathematically safe?
  const clinched = me.rank <= rules.postseasonSpots && magicNumber === 0;
  const eliminated = eliminationNumber === 0;

  return {
    rank: me.rank,
    score: me.score,
    gamesRemaining,
    maxScore,
    cutoffTeam,
    firstOutTeam,
    marginToCutoff,
    magicNumber,
    eliminationNumber,
    clinched,
    eliminated,
    status: clinched ? "clinched" : eliminated ? "eliminated" : "in-the-race",
  };
}
