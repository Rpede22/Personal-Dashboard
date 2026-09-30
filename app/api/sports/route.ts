import { NextResponse } from "next/server";
import {
  SPORTS_DB_BASE,
  TeamConfig,
  LEAGUE_MAPPINGS,
  LeagueAutoConfig,
} from "@/lib/sports-config";
import { readFollowedTeams, getFollowedTeam, followedToTeamConfig } from "@/lib/followed-teams";
import {
  afFetchStandings,
  afFetchLast5,
  afFetchNext5,
  AFStandingRow,
  AFFixture,
} from "@/lib/api-football";
import {
  fmFetchLeague,
  fmTeamFixtures,
  FMStandingRow,
  FMFixture,
  FMSubTable,
} from "@/lib/fotmob";
import {
  mlFetchStandings,
  mlFetchMatches,
  pickLast5,
  pickNext5,
} from "@/lib/metalligaen";
import { espnFetchStandings, espnFetchTeamGames, EspnStandingRow, EspnGame } from "@/lib/espn";

// ── Cache ──────────────────────────────────────────────────────────────────────
const cache = new Map<string, { data: unknown; ts: number }>();
const TSDB_TTL = 10 * 60 * 1000;          // TheSportsDB: 10 min
const AF_TTL   = 30 * 60 * 1000;          // API-Football: 30 min (100 req/day free tier)
const LEAGUE_DETECT_TTL = 60 * 60 * 1000; // League auto-detect: 1 h

function hasApiFootballKey(): boolean {
  return !!(process.env.RAPIDAPI_KEY);
}

// ── Shared types ───────────────────────────────────────────────────────────────

export interface SportsStandingRow {
  rank: number;
  team: string;
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  otLosses?: number;   // hockey only — regulation-losses vs OT/SO losses are tracked separately
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  // ESPN (US sports) only — the conference/division context that replaces a
  // league "position". `seed` = conference playoff seed.
  group?: string;         // conference
  groupRank?: number;     // rank within conference
  seed?: number;
  division?: string;      // division (e.g. "Pacific Division")
  divisionRank?: number;  // rank within division
}

export interface SportsEvent {
  matchId?: string | null; // FotMob match ID — present when source is fotmob
  espnEventId?: string;    // ESPN event id — present when source is espn (last-5 scoring dropdown)
  periods?: { home: number; away: number }[]; // Metal Ligaen per-period scores (last-5 dropdown)
  date: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  finished: boolean;
  league: string;
}

export interface SportsSubTable {
  name: string;       // English name from source ("Promotion Group")
  localName?: string; // Localized ("Oprykningsspil")
  rows: SportsStandingRow[];
}

export interface SportsTeamData {
  config: TeamConfig;
  standing: SportsStandingRow | null;
  last5: SportsEvent[];
  next5: SportsEvent[];
  allStandings: SportsStandingRow[];
  subTables: SportsSubTable[];   // Populated when league has split tables (e.g. Danish 1st Div post-round 22)
  source: "fotmob" | "api-football" | "thesportsdb" | "metalligaen" | "espn";
  // ESPN (US sports) only: true when the new season hasn't started yet — every
  // standings row is 0-0-0. The rank/seed is then meaningless (arbitrary order),
  // so the UI shows a "Preseason" state instead of a fake "#12 · 0-0" + a broken
  // playoff bracket. The schedule (next5) still carries the upcoming fixtures.
  preseason?: boolean;
}

// ── TheSportsDB helpers ────────────────────────────────────────────────────────

function parseEvent(e: Record<string, string>, finished: boolean): SportsEvent {
  const hs = e.intHomeScore;
  const as = e.intAwayScore;
  return {
    date: e.dateEvent ?? "",
    time: (e.strTime ?? "").slice(0, 5),
    homeTeam: e.strHomeTeam ?? "",
    awayTeam: e.strAwayTeam ?? "",
    homeScore: finished && hs && hs !== "null" ? parseInt(hs) : null,
    awayScore: finished && as && as !== "null" ? parseInt(as) : null,
    finished,
    league: e.strLeague ?? "",
  };
}

function matchesTeam(event: SportsEvent | Record<string, string>, keyword: string): boolean {
  if ("homeTeam" in event) {
    return (
      (event as SportsEvent).homeTeam.toLowerCase().includes(keyword.toLowerCase()) ||
      (event as SportsEvent).awayTeam.toLowerCase().includes(keyword.toLowerCase())
    );
  }
  const e = event as Record<string, string>;
  return (
    (e.strHomeTeam ?? "").toLowerCase().includes(keyword.toLowerCase()) ||
    (e.strAwayTeam ?? "").toLowerCase().includes(keyword.toLowerCase())
  );
}

async function tsdbFetchStandings(leagueId: string, season: string): Promise<SportsStandingRow[]> {
  const [yearA, yearB] = season.split("-");
  const candidates = [season, yearB ?? yearA, yearA, `${yearA}/${yearB ?? yearA}`].filter(
    (v, i, a) => a.indexOf(v) === i
  );
  for (const s of candidates) {
    try {
      const res = await fetch(`${SPORTS_DB_BASE}/lookuptable.php?l=${leagueId}&s=${s}`);
      if (!res.ok) continue;
      const data = await res.json();
      const table: Record<string, string>[] = data.table ?? [];
      if (!table.length) continue;
      return table.map((t) => ({
        rank:         parseInt(t.intRank ?? "0"),
        team:         t.strTeam ?? "",
        teamId:       t.idTeam ?? "",
        played:       parseInt(t.intPlayed ?? "0"),
        won:          parseInt(t.intWin ?? "0"),
        drawn:        parseInt(t.intDraw ?? "0"),
        lost:         parseInt(t.intLoss ?? "0"),
        goalsFor:     parseInt(t.intGoalsFor ?? "0"),
        goalsAgainst: parseInt(t.intGoalsAgainst ?? "0"),
        goalDiff:     parseInt(t.intGoalDifference ?? "0"),
        points:       parseInt(t.intPoints ?? "0"),
      }));
    } catch { continue; }
  }
  return [];
}

async function tsdbFetchLast5(team: TeamConfig, leagueEventsWork: boolean): Promise<SportsEvent[]> {
  if (leagueEventsWork) {
    try {
      const res = await fetch(`${SPORTS_DB_BASE}/eventspastleague.php?id=${team.leagueId}`);
      if (res.ok) {
        const data = await res.json();
        const events: Record<string, string>[] = data.events ?? [];
        const filtered = events.filter((e) => matchesTeam(e, team.matchKeyword));
        const sorted = filtered.sort((a, b) => b.dateEvent?.localeCompare(a.dateEvent ?? "") ?? 0);
        return sorted.slice(0, 5).reverse().map((e) => parseEvent(e, true));
      }
    } catch { /* fall through */ }
  }
  try {
    const res = await fetch(`${SPORTS_DB_BASE}/eventslast.php?id=${team.id}`);
    if (!res.ok) return [];
    const data = await res.json();
    const events: Record<string, string>[] = data.results ?? [];
    // ALWAYS filter by matchKeyword — TheSportsDB sometimes returns events for wrong team
    const filtered = events.filter((e) => matchesTeam(e, team.matchKeyword));
    const base = filtered.length >= 1 ? filtered : events;
    return base.slice(-5).map((e) => parseEvent(e, true));
  } catch { return []; }
}

async function tsdbFetchNext5(team: TeamConfig, leagueEventsWork: boolean): Promise<SportsEvent[]> {
  if (leagueEventsWork) {
    try {
      const res = await fetch(`${SPORTS_DB_BASE}/eventsnextleague.php?id=${team.leagueId}`);
      if (res.ok) {
        const data = await res.json();
        const events: Record<string, string>[] = data.events ?? [];
        const filtered = events.filter((e) => matchesTeam(e, team.matchKeyword));
        return filtered.slice(0, 5).map((e) => parseEvent(e, false));
      }
    } catch { /* fall through */ }
  }
  try {
    const res = await fetch(`${SPORTS_DB_BASE}/eventsnext.php?id=${team.id}`);
    if (!res.ok) return [];
    const data = await res.json();
    const events: Record<string, string>[] = data.events ?? [];
    // ALWAYS filter by matchKeyword to avoid TheSportsDB returning wrong team's events
    const filtered = events.filter((e) => matchesTeam(e, team.matchKeyword));
    return filtered.slice(0, 5).map((e) => parseEvent(e, false));
  } catch { return []; }
}

// ── API-Football adapters ──────────────────────────────────────────────────────

function afStandingToRow(s: AFStandingRow): SportsStandingRow {
  return {
    rank:         s.rank,
    team:         s.teamName,
    teamId:       String(s.teamId),
    played:       s.played,
    won:          s.won,
    drawn:        s.drawn,
    lost:         s.lost,
    goalsFor:     s.goalsFor,
    goalsAgainst: s.goalsAgainst,
    goalDiff:     s.goalDiff,
    points:       s.points,
  };
}

function afFixtureToEvent(f: AFFixture): SportsEvent {
  return {
    date:      f.date,
    time:      f.time,
    homeTeam:  f.homeTeam,
    awayTeam:  f.awayTeam,
    homeScore: f.homeScore,
    awayScore: f.awayScore,
    finished:  f.finished,
    league:    "",
  };
}

// ── FotMob adapters ────────────────────────────────────────────────────────────

function fmStandingToRow(s: FMStandingRow): SportsStandingRow {
  return {
    rank:         s.rank,
    team:         s.team,
    teamId:       s.teamId,
    played:       s.played,
    won:          s.wins,
    drawn:        s.draws,
    lost:         s.losses,
    goalsFor:     s.goalsFor,
    goalsAgainst: s.goalsAgainst,
    goalDiff:     s.goalDiff,
    points:       s.points,
  };
}

function fmSubTableToSports(t: FMSubTable): SportsSubTable {
  return {
    name:      t.name,
    localName: t.localName,
    rows:      t.rows.map(fmStandingToRow),
  };
}

function fmFixtureToEvent(f: FMFixture, leagueName: string): SportsEvent {
  return {
    matchId:   f.matchId,
    date:      f.date,
    time:      f.time,
    homeTeam:  f.homeTeam,
    awayTeam:  f.awayTeam,
    homeScore: f.homeScore,
    awayScore: f.awayScore,
    finished:  f.finished,
    league:    leagueName,
  };
}

// ── ESPN adapters (US leagues: NBA / NFL / NHL) ──────────────────────────────────
// US sports are win-loss, not points tables. We keep the shared row shape:
// `drawn` carries NFL ties (0 elsewhere), `otLosses` carries NHL OT losses,
// goalsFor/Against carry points-for/against, and `points` is the real standings
// points for the NHL / the win count for NBA & NFL (so the table sorts sanely).
function espnStandingToRow(r: EspnStandingRow, rank: number): SportsStandingRow {
  return {
    rank,
    team:         r.name,
    teamId:       r.teamId,
    played:       r.wins + r.losses + r.ties + (r.otLosses ?? 0),
    won:          r.wins,
    drawn:        r.ties,
    lost:         r.losses,
    otLosses:     r.otLosses,
    goalsFor:     r.pointsFor,
    goalsAgainst: r.pointsAgainst,
    goalDiff:     r.pointDiff,
    points:       r.points ?? r.wins,
    group:        r.group,
    groupRank:    r.groupRank,
    seed:         r.seed || undefined,
    division:     r.division,
    divisionRank: r.divisionRank,
  };
}

/**
 * Group ESPN standings into sub-tables, EDM-style. Prefers **division** grouping
 * (Pacific / Central / …) when ESPN supplied it (`?level=3`), matching the NHL
 * hub's default view; falls back to conference grouping otherwise. The
 * conference `seed`/`groupRank` still rides on each row for the playoff bracket.
 */
function espnSubTables(allStandings: SportsStandingRow[]): SportsSubTable[] {
  const hasDivisions = allStandings.some((r) => r.division);
  const key: (r: SportsStandingRow) => string | undefined = hasDivisions
    ? (r) => r.division
    : (r) => r.group;
  const rankOf: (r: SportsStandingRow) => number = hasDivisions
    ? (r) => r.divisionRank ?? 999
    : (r) => r.groupRank ?? 999;
  const byGroup = new Map<string, SportsStandingRow[]>();
  for (const row of allStandings) {
    const k = key(row);
    if (!k) continue;
    if (!byGroup.has(k)) byGroup.set(k, []);
    byGroup.get(k)!.push(row);
  }
  const tables = [...byGroup.entries()].map(([name, rows]) => ({
    name,
    rows: rows.slice().sort((a, b) => rankOf(a) - rankOf(b)),
  }));
  // Keep divisions of the same conference together (AFC group, then NFC), so the
  // standings read like the NHL hub rather than interleaving conferences.
  if (hasDivisions) {
    tables.sort((a, b) => {
      const ca = a.rows[0]?.group ?? "";
      const cb = b.rows[0]?.group ?? "";
      return ca.localeCompare(cb) || a.name.localeCompare(b.name);
    });
  }
  return tables;
}

function espnGameToEvent(g: EspnGame, leagueName: string): SportsEvent {
  return {
    matchId:   null,
    espnEventId: g.id || undefined,
    date:      g.date,
    time:      g.time,
    homeTeam:  g.homeTeam,
    awayTeam:  g.awayTeam,
    homeScore: g.homeScore,
    awayScore: g.awayScore,
    finished:  g.finished,
    league:    leagueName,
  };
}

// ── League auto-detection ──────────────────────────────────────────────────────

async function detectLeague(team: TeamConfig): Promise<LeagueAutoConfig | null> {
  if (!team.leagueAutoDetect) return null;
  const cacheKey = `league-detect-${team.id}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < LEAGUE_DETECT_TTL) return cached.data as LeagueAutoConfig | null;
  try {
    const res = await fetch(`${SPORTS_DB_BASE}/lookupteam.php?id=${team.id}`);
    if (!res.ok) return null;
    const data = await res.json();
    const teamData = data.teams?.[0];
    if (!teamData) return null;
    const leagueName: string = teamData.strLeague ?? "";
    const detected = LEAGUE_MAPPINGS[team.id]?.[leagueName] ?? null;
    cache.set(cacheKey, { data: detected, ts: Date.now() });
    return detected;
  } catch { return null; }
}

async function resolveTeamLeague(team: TeamConfig): Promise<ResolvedLeague> {
  const detected = await detectLeague(team);
  if (detected) {
    return {
      leagueId:         detected.id,
      leagueName:       detected.name,
      leagueEventsWork: detected.leagueEventsWork,
      splitAfterRank:   detected.splitAfterRank,
      splitLabel:       detected.splitLabel,
    };
  }
  return {
    leagueId:         team.leagueId,
    leagueName:       team.leagueName,
    leagueEventsWork: team.leagueEventsWork,
    splitAfterRank:   team.splitAfterRank,
    splitLabel:       team.splitLabel,
  };
}

// ── Main data fetcher ──────────────────────────────────────────────────────────

type ResolvedLeague = { leagueId: string; leagueName: string; leagueEventsWork: boolean; splitAfterRank?: number; splitLabel?: string };

async function fetchTeamData(team: TeamConfig, full: boolean): Promise<{
  standing: SportsStandingRow | null;
  last5: SportsEvent[];
  next5: SportsEvent[];
  allStandings: SportsStandingRow[];
  subTables: SportsSubTable[];
  source: "fotmob" | "api-football" | "thesportsdb" | "metalligaen" | "espn";
  preseason?: boolean;
  resolvedConfig: ResolvedLeague;
}> {
  const league = await resolveTeamLeague(team);

  // ── ESPN (US leagues: NBA / NFL / NHL) ─────────────────────────────────────
  // Checked BEFORE the icehockey branch below because NHL is also "icehockey"
  // but must use ESPN, not Metal Ligaen. Standings + team schedule from ESPN's
  // free hidden API; the team is matched by name (matchKeyword) and games by
  // team id.
  if (team.espnSport && team.espnLeague) {
    const path = { sport: team.espnSport, league: team.espnLeague };
    // Standings first so we can resolve the ESPN team id by name when it wasn't
    // captured at add-time (an add during an offseason gap bakes an entry with
    // no espnTeamId → the schedule fetch below is skipped → "no next match").
    const rows = await espnFetchStandings(path);
    const resolvedTeamId = team.espnTeamId
      || rows.find((r) => r.name.toLowerCase().includes(team.matchKeyword.toLowerCase()))?.teamId
      || undefined;
    const games = full && resolvedTeamId
      ? await espnFetchTeamGames(path, resolvedTeamId)
      : { last5: [], next5: [] };
    if (rows.length > 0) {
      const allStandings = rows.map((r, i) => espnStandingToRow(r, i + 1));
      const standing = allStandings.find((s) => s.team.toLowerCase().includes(team.matchKeyword.toLowerCase())) ?? null;
      // Preseason: the new season's table exists but nobody has played yet, so
      // every rank/seed is arbitrary. Flag it so the UI shows a "Preseason"
      // state rather than a misleading "#12 · 0-0" + a broken bracket.
      const preseason = allStandings.every((s) => s.played === 0);
      return {
        standing,
        last5: games.last5.map((g) => espnGameToEvent(g, league.leagueName)),
        next5: games.next5.map((g) => espnGameToEvent(g, league.leagueName)),
        allStandings,
        subTables: espnSubTables(allStandings),
        source: "espn",
        preseason,
        resolvedConfig: league,
      };
    }
    // Fall through if ESPN returned nothing (offseason gap, etc.)
  }

  // ── Metal Ligaen (any followed Danish hockey team) — use their own JSON ────
  // Way more reliable than TheSportsDB for Danish hockey and gives us proper
  // playoff data for a separate /api/sports/playoffs endpoint. Keyed on the
  // sport (not a hardcoded slug) so any Metal Ligaen team the user follows
  // routes here and is matched by keyword.
  if (team.sport === "icehockey") {
    const [standings, allMatches] = await Promise.all([
      mlFetchStandings(),
      mlFetchMatches(),
    ]);
    if (standings.length > 0) {
      const standing = standings.find((s) => s.team.toLowerCase().includes(team.matchKeyword.toLowerCase())) ?? null;
      return {
        standing,
        last5: pickLast5(allMatches, team.matchKeyword),
        next5: full ? pickNext5(allMatches, team.matchKeyword) : [],
        allStandings: standings,
        subTables: [],
        source: "metalligaen",
        resolvedConfig: league,
      };
    }
    // Fall through to legacy sources if Metal Ligaen didn't respond
  }

  // ── Prefer FotMob when configured (free, full standings, correct fixtures) ─
  if (team.fotmobLeagueId && team.fotmobTeamId) {
    const fm = await fmFetchLeague(team.fotmobLeagueId);
    if (fm && fm.mainTable.length > 0) {
      const { last5, next5 } = fmTeamFixtures(fm, team.fotmobTeamId, team.matchKeyword);
      const allStandings = fm.mainTable.map(fmStandingToRow);
      const standing = allStandings.find((s) => s.team.toLowerCase().includes(team.matchKeyword.toLowerCase())) ?? null;
      return {
        standing,
        last5: last5.map((f) => fmFixtureToEvent(f, fm.leagueName)),
        next5: full ? next5.map((f) => fmFixtureToEvent(f, fm.leagueName)) : [],
        allStandings,
        subTables: fm.subTables.map(fmSubTableToSports),
        source: "fotmob",
        resolvedConfig: league,
      };
    }
    // Empty response — fall through
  }

  // ── API-Football (only when RAPIDAPI_KEY is valid) ─────────────────────────
  if (
    hasApiFootballKey() &&
    team.apiFootballTeamId &&
    team.apiFootballLeagueId &&
    team.apiFootballSeason
  ) {
    const { apiFootballTeamId: tid, apiFootballLeagueId: lid, apiFootballSeason: season } = team;
    const tasks: [Promise<AFStandingRow[]>, Promise<AFFixture[]>, Promise<AFFixture[]>] = [
      afFetchStandings(lid, season),
      full ? afFetchLast5(tid) : Promise.resolve([]),
      full ? afFetchNext5(tid) : Promise.resolve([]),
    ];
    const [afStandings, afLast5, afNext5] = await Promise.all(tasks);
    const allStandings = afStandings.map(afStandingToRow);

    if (allStandings.length > 0) {
      const standing = allStandings.find((s) => s.team.toLowerCase().includes(team.matchKeyword.toLowerCase())) ?? null;
      return {
        standing,
        last5: afLast5.map(afFixtureToEvent),
        next5: afNext5.map(afFixtureToEvent),
        allStandings,
        subTables: [],
        source: "api-football",
        resolvedConfig: league,
      };
    }
  }

  // ── Fall back to TheSportsDB ───────────────────────────────────────────────
  const [standings, last5, next5] = await Promise.all([
    tsdbFetchStandings(league.leagueId, team.season),
    tsdbFetchLast5(team, league.leagueEventsWork),
    full ? tsdbFetchNext5(team, league.leagueEventsWork) : Promise.resolve([]),
  ]);
  const standing = standings.find((s) => s.team.includes(team.matchKeyword)) ?? null;
  return {
    standing,
    last5,
    next5,
    allStandings: standings,
    subTables: [],
    source: "thesportsdb",
    resolvedConfig: league,
  };
}

// ── Route ──────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const teamSlug = searchParams.get("team");
  const useAF = hasApiFootballKey();
  const ttl = useAF ? AF_TTL : TSDB_TTL;

  const followed = readFollowedTeams();
  const followedTeam = teamSlug ? getFollowedTeam(teamSlug) : undefined;

  if (!teamSlug || !followedTeam) {
    // Dashboard summary — standings + last5 only (no next5 to save API quota).
    // Cache key includes the followed slugs so editing the list busts it.
    const summaryKey = `all-summary-${useAF ? "af" : "tsdb"}-${followed.map((t) => t.slug).join(",")}`;
    const cached = cache.get(summaryKey);
    if (cached && Date.now() - cached.ts < ttl) return NextResponse.json(cached.data);

    const summaries = await Promise.all(
      followed.map(followedToTeamConfig).map(async (team) => {
        const result = await fetchTeamData(team, true);
        // Top-3 opponent list is used by the dashboard's match-of-the-week
        // highlight so the widget can flag "you play a top-3 side next".
        const topOpponents = result.allStandings
          .filter((r) => !r.team.toLowerCase().includes(team.matchKeyword.toLowerCase()))
          .sort((a, b) => a.rank - b.rank)
          .slice(0, 3)
          .map((r) => r.team);
        return {
          slug: team.slug,
          config: { ...team, ...result.resolvedConfig },
          standing: result.standing,
          last5: result.last5,
          next5: result.next5.slice(0, 3),
          subTables: result.subTables,
          source: result.source,
          preseason: result.preseason,
          topOpponents,
        };
      })
    );
    const payload = { summaries };
    cache.set(summaryKey, { data: payload, ts: Date.now() });
    return NextResponse.json(payload);
  }

  const cacheKey = `team-${teamSlug}-${useAF ? "af" : "tsdb"}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < ttl) return NextResponse.json(cached.data);

  const team = followedToTeamConfig(followedTeam);
  const result = await fetchTeamData(team, true);

  const payload: SportsTeamData = {
    config: { ...team, ...result.resolvedConfig },
    standing: result.standing,
    last5: result.last5,
    next5: result.next5,
    allStandings: result.allStandings,
    subTables: result.subTables,
    source: result.source,
    preseason: result.preseason,
  };
  cache.set(cacheKey, { data: payload, ts: Date.now() });
  return NextResponse.json(payload);
}
