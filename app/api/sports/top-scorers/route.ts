import { NextResponse } from "next/server";
import { SPORTS_TEAMS } from "@/lib/sports-config";

/**
 * Top scorers for the given team's league.
 *   Football (Barca, Esbjerg fB): FotMob top-stats JSON hosted at
 *     data.fotmob.com/stats/{leagueId}/season/{seasonId}/{statName}.json
 *     We fetch goals + goal_assist separately (250+ players each) then merge
 *     by player id to compute a per-player G/A/P table.
 *   Hockey (Esbjerg Energy): statistik.metalligaen.dk/metal-liga-stats-theme/stats/get
 *     returns a `{ data: [...] }` payload with fields
 *     {id, name, short_team, pos, games_played, points, goals, assists}.
 *
 * The Metal Ligaen endpoint 500s out of season — that's expected; the route
 * returns `{ leaders: [] }` in that case instead of failing the whole hub.
 */

interface Leader {
  playerId: number | string;
  name: string;
  team: string;
  position?: string;
  gamesPlayed: number;
  goals: number;
  assists: number;
  points: number;
}

// per-team cache — keyed by slug, 1 h TTL. Failure paths still cache
// (short TTL) so a flaky upstream doesn't get hammered on every request.
const cache = new Map<string, { data: Leader[]; ts: number; ttl: number }>();
const OK_TTL = 60 * 60 * 1000;
const FAIL_TTL = 5 * 60 * 1000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("team");
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "10", 10) || 10, 1), 50);

  if (!slug) return NextResponse.json({ error: "missing team" }, { status: 400 });
  const cfg = SPORTS_TEAMS[slug];
  if (!cfg) return NextResponse.json({ error: "unknown team" }, { status: 404 });

  const cached = cache.get(slug);
  if (cached && Date.now() - cached.ts < cached.ttl) {
    return NextResponse.json({ sport: cfg.sport, leaders: cached.data.slice(0, limit) });
  }

  try {
    let leaders: Leader[] = [];
    if (cfg.sport === "football" && cfg.fotmobLeagueId) {
      leaders = await fetchFotmobTopScorers(cfg.fotmobLeagueId);
    } else if (cfg.sport === "icehockey" && slug === "esbjerg-energy") {
      leaders = await fetchMetalLigaenTopScorers();
    }
    cache.set(slug, { data: leaders, ts: Date.now(), ttl: leaders.length > 0 ? OK_TTL : FAIL_TTL });
    return NextResponse.json({ sport: cfg.sport, leaders: leaders.slice(0, limit) });
  } catch (err) {
    // Cache the failure briefly so retries don't stampede a flaky upstream
    cache.set(slug, { data: [], ts: Date.now(), ttl: FAIL_TTL });
    return NextResponse.json({ sport: cfg.sport, leaders: [], error: String(err) }, { status: 200 });
  }
}

// ── FotMob (football) ──────────────────────────────────────────────────────

interface FotmobStatItem {
  ParticipantName: string;
  ParticiantId: number;     // sic — FotMob's field name
  TeamId: number;
  TeamName: string;
  StatValue: number;
  MinutesPlayed: number;
  MatchesPlayed: number;
  Rank: number;
}
interface FotmobTopStats { TopLists: { StatName: string; StatList: FotmobStatItem[] }[] }
interface FotmobSeasonLink { RelativePath: string; Name: string }

async function fetchFotmobTopScorers(leagueId: number): Promise<Leader[]> {
  const seasonPath = await pickFotmobSeasonPath(leagueId);
  if (!seasonPath) return [];
  // seasonPath is something like `stats/87/season/27233/topstats.json` — strip
  // the trailing `topstats.json` to get the per-stat prefix.
  const prefix = seasonPath.replace(/topstats\.json$/, "");

  const [goalsRes, assistsRes] = await Promise.all([
    fetchJson<FotmobTopStats>(`https://data.fotmob.com/${prefix}goals.json`),
    fetchJson<FotmobTopStats>(`https://data.fotmob.com/${prefix}goal_assist.json`),
  ]);

  const goalsList = goalsRes?.TopLists?.[0]?.StatList ?? [];
  const assistsList = assistsRes?.TopLists?.[0]?.StatList ?? [];

  const byId = new Map<number, Leader>();
  for (const it of goalsList) {
    byId.set(it.ParticiantId, {
      playerId: it.ParticiantId,
      name: it.ParticipantName,
      team: it.TeamName,
      gamesPlayed: it.MatchesPlayed,
      goals: it.StatValue,
      assists: 0,
      points: it.StatValue,
    });
  }
  for (const it of assistsList) {
    const existing = byId.get(it.ParticiantId);
    if (existing) {
      existing.assists = it.StatValue;
      existing.points = existing.goals + existing.assists;
    } else {
      byId.set(it.ParticiantId, {
        playerId: it.ParticiantId,
        name: it.ParticipantName,
        team: it.TeamName,
        gamesPlayed: it.MatchesPlayed,
        goals: 0,
        assists: it.StatValue,
        points: it.StatValue,
      });
    }
  }

  return [...byId.values()]
    .sort((a, b) => b.goals - a.goals || b.points - a.points || b.assists - a.assists);
}

/**
 * FotMob's `seasonStatLinks` lists every season for which top-stats exist.
 * The newest one may reference an upcoming season that isn't hosted yet
 * (returns 404), so try each in order until one responds. Cache the winner
 * for 24 h so we don't keep probing.
 */
const seasonCache = new Map<number, { path: string; ts: number }>();
const SEASON_TTL = 24 * 60 * 60 * 1000;

async function pickFotmobSeasonPath(leagueId: number): Promise<string | null> {
  const cached = seasonCache.get(leagueId);
  if (cached && Date.now() - cached.ts < SEASON_TTL) return cached.path;

  const meta = await fetchJson<{ stats?: { seasonStatLinks?: FotmobSeasonLink[] } }>(
    `https://www.fotmob.com/api/data/leagues?id=${leagueId}&tab=stats`
  );
  const links = meta?.stats?.seasonStatLinks ?? [];
  for (const link of links) {
    const url = `https://data.fotmob.com/${link.RelativePath}`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept-Encoding": "gzip, deflate, br" }, next: { revalidate: 3600 } });
      if (res.ok) {
        seasonCache.set(leagueId, { path: link.RelativePath, ts: Date.now() });
        return link.RelativePath;
      }
    } catch { /* try next */ }
  }
  return null;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", "Accept-Encoding": "gzip, deflate, br", "Accept": "application/json" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;
  try { return (await res.json()) as T; } catch { return null; }
}

// ── Metal Ligaen (hockey) ──────────────────────────────────────────────────

interface MetalLigaenRow {
  id: number;
  name: string;
  short_team: string;
  pos?: string;
  games_played: number;
  points: number;
  goals: number;
  assists: number;
}

async function fetchMetalLigaenTopScorers(): Promise<Leader[]> {
  const url = "https://statistik.metalligaen.dk/metal-liga-stats-theme/stats/get?goalies=0&endgame=0&sorter=points&limit=25&page=1&size=25";
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": "https://statistik.metalligaen.dk/top-25",
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const raw: unknown = await res.json();
    // Endpoint returns either `{data: [...]}` or `[...]` — accept both.
    const rows: MetalLigaenRow[] = Array.isArray(raw)
      ? (raw as MetalLigaenRow[])
      : Array.isArray((raw as { data?: unknown }).data)
        ? ((raw as { data: MetalLigaenRow[] }).data)
        : [];
    return rows.map((r) => ({
      playerId: r.id,
      name: r.name,
      team: r.short_team,
      position: r.pos,
      gamesPlayed: r.games_played,
      goals: r.goals,
      assists: r.assists,
      points: r.points,
    }));
  } catch {
    return [];
  }
}
