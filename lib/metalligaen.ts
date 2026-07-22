/**
 * Metal Ligaen (Danish ice hockey) — thin wrapper over the JSON that
 * metalligaen.dk uses on its own site (served from icestats.at / an S3 bucket).
 *
 * URL conventions found on 2026-07-21:
 *   Standings:  `table/{seasonEndYear}/{competitionId}.json`
 *   Matches:    `league-matches/{seasonStartYear}/{competitionId}.json`
 *   Playoffs:   `league-playoffs/{seasonStartYear}/{competitionId}.json`
 *   → Standings uses END year, matches/playoffs use START year. (Yes, really.)
 *
 * competitionId = 1 for the top division (Metal Ligaen).
 */

import type { SportsStandingRow, SportsEvent } from "@/app/api/sports/route";

const BASE = "https://s3.dualstack.eu-west-1.amazonaws.com/den.hokejovyzapis.cz";
const COMPETITION_ID = 1;

/**
 * Which season are we in? Metal Ligaen runs September → April. We call August
 * (month 7) the flip point so the app switches over as soon as pre-season starts.
 */
export function currentSeasonStartYear(now: Date = new Date()): number {
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
}

// ── Raw response types (only the fields we care about) ────────────────────────

interface RawClub {
  id: number;
  name: string;
  shortcut: string;
  position: number;
  games: number;
  wins: number;
  ties: number;
  losts: number;
  winsOt?: number;
  lostsOt?: number;
  score1: number;
  score2: number;
  points: number;
}

interface RawStandingsGroup {
  groupId: number | null;
  groupName: string;
  complete: boolean;
  clubs: RawClub[];
}

interface RawMatch {
  id: number;
  start_date: string; // "YYYY-MM-DD HH:MM:SS" (Europe/Copenhagen)
  status: string;     // "AFTER_MATCH" = finished, others = scheduled/live/etc
  league?: string;
  home: { id: number; name: string; shortcut: string } | null;
  guest: { id: number; name: string; shortcut: string } | null;
  results?: {
    extra_time?: boolean;
    shooting?: boolean;
    score?: {
      final?: { score_home: number; score_guest: number };
    };
  };
}

interface RawPlayoffTeam {
  id: number;
  name: string;
  shortcut: string;
  ranking: number;
  seriesScore: number;
  winner: boolean;
}

interface RawPlayoffSeries {
  teams: RawPlayoffTeam[];
  matches: RawMatch[];
}

interface RawPlayoffRound {
  id: number;
  name: string;     // "Quarterfinal" | "Semifinal" | "Bronze game" | "Final"
  active: number;
  series: RawPlayoffSeries[];
}

interface RawPlayoffs {
  league: { id: number; name: string; season: string };
  round: RawPlayoffRound[];
}

// ── Public bracket types (what our route returns) ─────────────────────────────

export interface PlayoffSide {
  teamId: string;
  team: string;
  shortcut: string;
  seed: number;
  wins: number;
  isWinner: boolean;
}

export interface PlayoffGame {
  date: string;   // YYYY-MM-DD
  time: string;   // HH:MM
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  finished: boolean;
  overtime: boolean;
  shootout: boolean;
}

export interface PlayoffSeriesShape {
  round: string;        // e.g. "Quarterfinal"
  roundOrder: number;   // 1..N so the UI can render in order
  top: PlayoffSide;     // higher-seed team (home ice advantage)
  bottom: PlayoffSide;
  complete: boolean;    // one team has 4 wins (best-of-7)
  games: PlayoffGame[];
}

export interface MetalLigaenPlayoffs {
  season: string;   // e.g. "2025" (start year — 2025-26)
  rounds: Array<{
    name: string;
    order: number;
    active: boolean;
    series: PlayoffSeriesShape[];
  }>;
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Return standings for the given season, with automatic fallback: if the current
 *  season's table is empty (season hasn't started yet), roll back to the previous
 *  completed season so we always show something meaningful. */
export async function mlFetchStandings(startYear: number = currentSeasonStartYear()): Promise<SportsStandingRow[]> {
  // Standings URL uses seasonEndYear
  for (const sy of [startYear, startYear - 1]) {
    const endYear = sy + 1;
    const data = await fetchJson<RawStandingsGroup[]>(`${BASE}/table/${endYear}/${COMPETITION_ID}.json`);
    const clubs = data?.[0]?.clubs ?? [];
    // Skip empty (pre-season) tables — every team at 0 games
    if (clubs.length && clubs.some((c) => (c.games ?? 0) > 0)) {
      return clubs.map(mlClubToRow);
    }
  }
  return [];
}

function mlClubToRow(c: RawClub): SportsStandingRow {
  return {
    rank: c.position ?? 0,
    team: c.name ?? "",
    teamId: String(c.id ?? ""),
    played: c.games ?? 0,
    won: c.wins ?? 0,
    drawn: c.ties ?? 0,
    lost: c.losts ?? 0,
    otLosses: c.lostsOt ?? 0,   // OT/SO losses tracked separately in Metal Ligaen
    goalsFor: c.score1 ?? 0,
    goalsAgainst: c.score2 ?? 0,
    goalDiff: (c.score1 ?? 0) - (c.score2 ?? 0),
    points: c.points ?? 0,
  };
}

/** Return every match for a season, with fallback to the previous season if this
 *  one's schedule isn't published yet. Filter by team keyword downstream. */
export async function mlFetchMatches(startYear: number = currentSeasonStartYear()): Promise<SportsEvent[]> {
  for (const sy of [startYear, startYear - 1]) {
    const data = await fetchJson<{ matches: RawMatch[] }>(`${BASE}/league-matches/${sy}/${COMPETITION_ID}.json`);
    const raw = data?.matches ?? [];
    if (raw.length) return raw.map(mlMatchToEvent);
  }
  return [];
}

function mlMatchToEvent(m: RawMatch): SportsEvent {
  const finished = m.status === "AFTER_MATCH";
  const final = m.results?.score?.final;
  const [datePart, timePart] = (m.start_date ?? "").split(" ");
  return {
    date: datePart ?? "",
    time: (timePart ?? "").slice(0, 5),
    homeTeam: m.home?.name ?? "",
    awayTeam: m.guest?.name ?? "",
    homeScore: finished && final ? final.score_home : null,
    awayScore: finished && final ? final.score_guest : null,
    finished,
    league: m.league ?? "Metal Ligaen",
  };
}

/** Pick the last N finished matches involving `keyword` (case-insensitive team name substring). */
export function pickLast5(all: SportsEvent[], keyword: string): SportsEvent[] {
  const key = keyword.toLowerCase();
  return all
    .filter((e) => e.finished && (e.homeTeam.toLowerCase().includes(key) || e.awayTeam.toLowerCase().includes(key)))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .slice(-5);
}

/** Pick the next N scheduled matches involving `keyword`. */
export function pickNext5(all: SportsEvent[], keyword: string): SportsEvent[] {
  const key = keyword.toLowerCase();
  return all
    .filter((e) => !e.finished && (e.homeTeam.toLowerCase().includes(key) || e.awayTeam.toLowerCase().includes(key)))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .slice(0, 5);
}

/**
 * Return the playoff bracket for the given season. Falls back to the previous
 * season if this one hasn't started playoffs yet, so an off-season view still
 * shows the last completed bracket.
 */
export async function mlFetchPlayoffs(startYear: number = currentSeasonStartYear()): Promise<MetalLigaenPlayoffs | null> {
  for (const sy of [startYear, startYear - 1]) {
    const data = await fetchJson<RawPlayoffs>(`${BASE}/league-playoffs/${sy}/${COMPETITION_ID}.json`);
    if (data?.round?.length) {
      return {
        season: data.league?.season ?? String(sy),
        rounds: data.round.map((r, idx) => ({
          name: r.name,
          order: idx + 1,
          active: !!r.active,
          series: r.series.map((s) => mlSeriesToPublic(s, r.name, idx + 1)),
        })),
      };
    }
  }
  return null;
}

function mlSeriesToPublic(s: RawPlayoffSeries, roundName: string, roundOrder: number): PlayoffSeriesShape {
  // Metal Ligaen best-of-7: seed with a lower `ranking` gets home ice.
  const [a, b] = s.teams;
  const [top, bottom] = (a?.ranking ?? 99) <= (b?.ranking ?? 99) ? [a, b] : [b, a];
  const complete = (a?.winner || b?.winner) === true || (a?.seriesScore ?? 0) >= 4 || (b?.seriesScore ?? 0) >= 4;
  return {
    round: roundName,
    roundOrder,
    top: teamToSide(top),
    bottom: teamToSide(bottom),
    complete,
    games: s.matches.map(mlPlayoffGame),
  };
}

function teamToSide(t: RawPlayoffTeam | undefined): PlayoffSide {
  return {
    teamId: t ? String(t.id) : "",
    team: t?.name ?? "?",
    shortcut: t?.shortcut ?? "?",
    seed: t?.ranking ?? 0,
    wins: t?.seriesScore ?? 0,
    isWinner: t?.winner ?? false,
  };
}

function mlPlayoffGame(m: RawMatch): PlayoffGame {
  const finished = m.status === "AFTER_MATCH";
  const final = m.results?.score?.final;
  const [datePart, timePart] = (m.start_date ?? "").split(" ");
  return {
    date: datePart ?? "",
    time: (timePart ?? "").slice(0, 5),
    homeTeam: m.home?.name ?? "",
    awayTeam: m.guest?.name ?? "",
    homeScore: finished && final ? final.score_home : null,
    awayScore: finished && final ? final.score_guest : null,
    finished,
    overtime: !!m.results?.extra_time,
    shootout: !!m.results?.shooting,
  };
}
