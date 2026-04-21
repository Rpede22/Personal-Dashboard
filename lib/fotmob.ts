// FotMob unofficial API. Requires a User-Agent header.
// Base: https://www.fotmob.com/api/data/leagues?id=<leagueId>
// Response shape (observed 2026-04):
//   - table[0].data.table.all        → single league (e.g. La Liga, 20 teams)
//   - table[0].data.tables[]         → split leagues (e.g. Danish 1st Div):
//        [0] Promotion Group (top 6) — "Oprykningsspil"
//        [1] Relegation Group (bottom 6) — "Nedrykningsspil"
//        [2] 1. Division (full regular season, 12 teams)
//   - fixtures.allMatches[]          → all season fixtures with scores
//
// Free, no API key, but rate-limits if abused — we cache for 30 min.

const FOTMOB_BASE = "https://www.fotmob.com/api/data/leagues";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36";

export interface FMStandingRow {
  rank: number;
  team: string;
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}

export interface FMSubTable {
  name: string;            // "Promotion Group" / "Relegation Group" / "1. Division"
  localName?: string;      // "Oprykningsspil" / "Nedrykningsspil" / "Regular Season"
  rows: FMStandingRow[];
}

export interface FMFixture {
  date: string;   // YYYY-MM-DD
  time: string;   // HH:MM UTC (caller converts to local)
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  finished: boolean;
}

export interface FMLeagueData {
  leagueName: string;
  // If the league is split (Danish 1st Div post-round 22), `subTables` has 3 tables.
  // Otherwise `mainTable` has the single full standings.
  mainTable: FMStandingRow[];
  subTables: FMSubTable[];
  fixtures: FMFixture[];
}

// ── Cache ─────────────────────────────────────────────────────────────────────
const TTL = 30 * 60 * 1000; // 30 min — FotMob doesn't rate-limit heavily but be polite
const cache = new Map<string, { data: FMLeagueData; ts: number }>();

// ── Parsing helpers ───────────────────────────────────────────────────────────
interface FMRawRow {
  name: string;
  id: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scoresStr: string;   // "52-27"
  goalConDiff?: number;
  pts: number;
  idx: number;
}

function parseRow(r: FMRawRow): FMStandingRow {
  const [gf, ga] = (r.scoresStr ?? "0-0").split("-").map((n) => parseInt(n, 10) || 0);
  return {
    rank:         r.idx,
    team:         r.name,
    teamId:       String(r.id),
    played:       r.played ?? 0,
    wins:         r.wins ?? 0,
    draws:        r.draws ?? 0,
    losses:       r.losses ?? 0,
    goalsFor:     gf,
    goalsAgainst: ga,
    goalDiff:     r.goalConDiff ?? (gf - ga),
    points:       r.pts ?? 0,
  };
}

// Map FotMob English group names to local Danish labels (when applicable)
const GROUP_NAME_MAP: Record<string, string> = {
  "Promotion Group":  "Oprykningsspil",
  "Relegation Group": "Nedrykningsspil",
  "1. Division":      "Regular Season",
};

interface FMRawMatch {
  home: { name: string; id: string };
  away: { name: string; id: string };
  status: {
    utcTime: string;
    finished?: boolean;
    started?: boolean;
    cancelled?: boolean;
    scoreStr?: string; // "2 - 0"
  };
}

function parseMatch(m: FMRawMatch): FMFixture {
  const dt = new Date(m.status.utcTime);
  const date = dt.toISOString().slice(0, 10);
  const time = dt.toISOString().slice(11, 16);
  let homeScore: number | null = null;
  let awayScore: number | null = null;
  if (m.status.finished && m.status.scoreStr) {
    const [h, a] = m.status.scoreStr.split("-").map((n) => parseInt(n.trim(), 10));
    if (!isNaN(h)) homeScore = h;
    if (!isNaN(a)) awayScore = a;
  }
  return {
    date,
    time,
    homeTeam:  m.home.name,
    awayTeam:  m.away.name,
    homeScore,
    awayScore,
    finished:  !!m.status.finished,
  };
}

// ── Public fetchers ───────────────────────────────────────────────────────────
export async function fmFetchLeague(leagueId: number): Promise<FMLeagueData | null> {
  const cached = cache.get(String(leagueId));
  if (cached && Date.now() - cached.ts < TTL) return cached.data;

  try {
    const res = await fetch(`${FOTMOB_BASE}?id=${leagueId}`, {
      headers: { "User-Agent": UA },
      next: { revalidate: 1800 },
    });
    if (!res.ok) return null;
    const data = await res.json();

    const leagueName: string = data.details?.name ?? data.table?.[0]?.data?.leagueName ?? "";

    // Standings
    const tableData = data.table?.[0]?.data;
    let mainTable: FMStandingRow[] = [];
    const subTables: FMSubTable[] = [];

    if (tableData?.tables && Array.isArray(tableData.tables)) {
      // Split league — tables is an array of subtables
      for (const t of tableData.tables as Array<{ leagueName: string; table?: { all?: FMRawRow[] } }>) {
        const rows = (t.table?.all ?? []).map(parseRow);
        subTables.push({
          name:      t.leagueName,
          localName: GROUP_NAME_MAP[t.leagueName],
          rows,
        });
      }
      // Use the "1. Division" / full table as the main table for the regular summary
      const full = subTables.find((s) => !s.name.toLowerCase().includes("group"));
      mainTable = full?.rows ?? subTables[subTables.length - 1]?.rows ?? [];
    } else if (tableData?.table?.all) {
      // Single league
      mainTable = (tableData.table.all as FMRawRow[]).map(parseRow);
    }

    // Fixtures
    const rawMatches: FMRawMatch[] = data.fixtures?.allMatches ?? [];
    const fixtures = rawMatches.map(parseMatch);

    const result: FMLeagueData = { leagueName, mainTable, subTables, fixtures };
    cache.set(String(leagueId), { data: result, ts: Date.now() });
    return result;
  } catch {
    return null;
  }
}

// Filter league fixtures for a specific team by team ID (preferred) or name substring
export function fmTeamFixtures(
  league: FMLeagueData,
  teamId: number | string,
  teamKeyword: string
): { last5: FMFixture[]; next5: FMFixture[] } {
  const tidStr = String(teamId);
  const kwLower = teamKeyword.toLowerCase();

  // FotMob fixtures don't expose team IDs on home/away in the allMatches list (verified empirically),
  // so we match by team name keyword. The keyword should be unique enough (e.g. "Barcelona", "Esbjerg fB").
  void tidStr;

  const mine = league.fixtures.filter(
    (f) =>
      f.homeTeam.toLowerCase().includes(kwLower) ||
      f.awayTeam.toLowerCase().includes(kwLower)
  );

  const played = mine.filter((f) => f.finished);
  const upcoming = mine.filter((f) => !f.finished);

  // Sort by date ascending, then take last 5 played and first 5 upcoming
  played.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  upcoming.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  return {
    last5: played.slice(-5),
    next5: upcoming.slice(0, 5),
  };
}
