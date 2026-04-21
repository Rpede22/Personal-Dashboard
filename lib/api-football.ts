/**
 * API-Football via RapidAPI
 * Docs: https://www.api-football.com/documentation-v3
 * Set RAPIDAPI_KEY in .env.local — free tier: 100 requests/day
 *
 * Team/League IDs used:
 *   FC Barcelona:          teamId=529,  leagueId=140 (La Liga),          season=2025
 *   Esbjerg fB:            teamId=1366, leagueId=120 (Danish 1st Div),   season=2025
 *     ^ verify Esbjerg fB ID at: https://www.api-football.com/documentation-v3#tag/Teams/operation/get-teams
 */

export const AF_BASE = "https://api-football-v1.p.rapidapi.com/v3";
export const AF_HOST = "api-football-v1.p.rapidapi.com";

function headers(): Record<string, string> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error("RAPIDAPI_KEY not configured");
  return {
    "x-rapidapi-host": AF_HOST,
    "x-rapidapi-key": key,
  };
}

export interface AFStandingRow {
  rank: number;
  teamId: number;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}

export interface AFFixture {
  date: string;   // "YYYY-MM-DD"
  time: string;   // "HH:MM" in CEST
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  finished: boolean;
}

export async function afFetchStandings(
  leagueId: number,
  season: number
): Promise<AFStandingRow[]> {
  const res = await fetch(
    `${AF_BASE}/standings?league=${leagueId}&season=${season}`,
    { headers: headers() }
  );
  if (!res.ok) return [];
  const data = await res.json();
  const standings: Record<string, unknown>[] =
    data.response?.[0]?.league?.standings?.[0] ?? [];
  return standings.map((s) => {
    const team = s.team as Record<string, unknown>;
    const all  = s.all  as Record<string, unknown>;
    const goals = (all?.goals ?? {}) as Record<string, number>;
    return {
      rank:          s.rank as number,
      teamId:        team.id as number,
      teamName:      team.name as string,
      played:        all.played as number,
      won:           all.win   as number,
      drawn:         all.draw  as number,
      lost:          all.lose  as number,
      goalsFor:      goals.for     ?? 0,
      goalsAgainst:  goals.against ?? 0,
      goalDiff:      s.goalsDiff as number,
      points:        s.points    as number,
    };
  });
}

function parseAFFixture(f: Record<string, unknown>, finished: boolean): AFFixture {
  const fixture = f.fixture as Record<string, unknown>;
  const teams   = f.teams  as Record<string, Record<string, string>>;
  const goals   = f.goals  as Record<string, number | null>;
  const dateStr = fixture.date as string;
  const dt      = new Date(dateStr);
  const statusShort = (fixture.status as Record<string, string>).short ?? "";
  const isFinished = finished || ["FT", "AET", "PEN", "AWD", "WO"].includes(statusShort);
  return {
    date:      dt.toISOString().slice(0, 10),
    time:      dt.toLocaleTimeString("en-GB", {
      hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin",
    }),
    homeTeam:  teams.home?.name ?? "",
    awayTeam:  teams.away?.name ?? "",
    homeScore: isFinished ? (goals?.home ?? null) : null,
    awayScore: isFinished ? (goals?.away ?? null) : null,
    finished:  isFinished,
  };
}

export async function afFetchLast5(teamId: number): Promise<AFFixture[]> {
  const res = await fetch(
    `${AF_BASE}/fixtures?team=${teamId}&last=5`,
    { headers: headers() }
  );
  if (!res.ok) return [];
  const data = await res.json();
  const fixtures: Record<string, unknown>[] = data.response ?? [];
  return fixtures.map((f) => parseAFFixture(f, true));
}

export async function afFetchNext5(teamId: number): Promise<AFFixture[]> {
  const res = await fetch(
    `${AF_BASE}/fixtures?team=${teamId}&next=5`,
    { headers: headers() }
  );
  if (!res.ok) return [];
  const data = await res.json();
  const fixtures: Record<string, unknown>[] = data.response ?? [];
  return fixtures.map((f) => parseAFFixture(f, false));
}
