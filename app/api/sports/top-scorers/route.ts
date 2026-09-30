import { NextResponse } from "next/server";
import { getFollowedTeam, followedToTeamConfig } from "@/lib/followed-teams";

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
  // ESPN US sports (NBA/NFL): a generic stat map rendered against `statColumns`,
  // since points/rebounds/assists/touchdowns don't fit the goals/assists shape.
  stats?: Record<string, number>;
}

interface StatColumn { key: string; label: string; title?: string }

// per-team cache — keyed by slug, 1 h TTL. Failure paths still cache
// (short TTL) so a flaky upstream doesn't get hammered on every request.
const cache = new Map<string, { data: Leader[]; statColumns?: StatColumn[]; ts: number; ttl: number }>();
const OK_TTL = 60 * 60 * 1000;
const FAIL_TTL = 5 * 60 * 1000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("team");
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "10", 10) || 10, 1), 50);
  // scope=team → this team's own scorers (Metal Ligaen only); default = league.
  const teamScope = searchParams.get("scope") === "team";

  if (!slug) return NextResponse.json({ error: "missing team" }, { status: 400 });
  const followed = getFollowedTeam(slug);
  if (!followed) return NextResponse.json({ error: "unknown team" }, { status: 404 });
  const cfg = followedToTeamConfig(followed);

  const cacheKey = teamScope ? `${slug}:team` : slug;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < cached.ttl) {
    return NextResponse.json({ sport: cfg.sport, leaders: cached.data.slice(0, limit), statColumns: cached.statColumns, scope: teamScope ? "team" : "league" });
  }

  try {
    let leaders: Leader[] = [];
    let statColumns: StatColumn[] | undefined;
    if (cfg.sport === "icehockey" && !cfg.espnLeague && teamScope) {
      // Per-team scorers for a Metal Ligaen club (NHL/ESPN handled below).
      leaders = await fetchMetalLigaenTeamScorers(cfg.matchKeyword);
    } else if (cfg.espnLeague && cfg.espnSport) {
      // US majors (NHL/NBA/NFL) via ESPN's byathlete stats endpoint. NHL maps
      // onto the standard goals/assists/points shape (rendered by the hockey
      // table); NBA/NFL return a generic stat map + column defs.
      const r = await fetchEspnLeaders(cfg.espnSport, cfg.espnLeague);
      leaders = r.leaders;
      statColumns = r.statColumns;
    } else if (cfg.sport === "football" && cfg.fotmobLeagueId) {
      leaders = await fetchFotmobTopScorers(cfg.fotmobLeagueId);
    } else if (cfg.sport === "icehockey") {
      // Metal Ligaen (Danish hockey) — ESPN NHL teams are handled above.
      leaders = await fetchMetalLigaenTopScorers();
    }
    cache.set(cacheKey, { data: leaders, statColumns, ts: Date.now(), ttl: leaders.length > 0 ? OK_TTL : FAIL_TTL });
    return NextResponse.json({ sport: cfg.sport, leaders: leaders.slice(0, limit), statColumns, scope: teamScope ? "team" : "league" });
  } catch (err) {
    // Cache the failure briefly so retries don't stampede a flaky upstream
    cache.set(cacheKey, { data: [], ts: Date.now(), ttl: FAIL_TTL });
    return NextResponse.json({ sport: cfg.sport, leaders: [], error: String(err) }, { status: 200 });
  }
}

// ── ESPN (US majors: NHL / NBA / NFL) ──────────────────────────────────────────
// Uses ESPN's byathlete stats endpoint. Each sport has its own sort key + the
// stat columns worth showing. NHL is a natural G/A/P table (rendered by the
// hockey path client-side); NBA (PTS/REB/AST) + NFL (TD/FG/PTS scoring) return a
// generic `statColumns` the client renders as-is.
interface EspnColSpec { key: string; label: string; title?: string; cat: string; stat: string }
interface EspnLeadersSpec { sort: string; nativeHockey?: boolean; cols: EspnColSpec[] }

const ESPN_LEADERS: Record<string, EspnLeadersSpec> = {
  nhl: {
    sort: "offensive.points:desc",
    nativeHockey: true,
    cols: [
      { key: "gamesPlayed", label: "GP", cat: "general", stat: "games" },
      { key: "goals", label: "G", cat: "offensive", stat: "goals" },
      { key: "assists", label: "A", cat: "offensive", stat: "assists" },
      { key: "points", label: "P", cat: "offensive", stat: "points" },
    ],
  },
  nba: {
    sort: "offensive.points:desc",
    cols: [
      { key: "gp", label: "GP", cat: "general", stat: "gamesPlayed" },
      { key: "pts", label: "PTS", title: "Total points", cat: "offensive", stat: "points" },
      { key: "reb", label: "REB", title: "Total rebounds", cat: "general", stat: "rebounds" },
      { key: "ast", label: "AST", title: "Total assists", cat: "offensive", stat: "assists" },
    ],
  },
  nfl: {
    sort: "scoring.totalPoints:desc",
    cols: [
      { key: "gp", label: "GP", cat: "general", stat: "gamesPlayed" },
      { key: "td", label: "TD", title: "Total touchdowns", cat: "scoring", stat: "totalTouchdowns" },
      { key: "fg", label: "FG", title: "Field goals", cat: "scoring", stat: "fieldGoals" },
      { key: "pts", label: "PTS", title: "Total points scored", cat: "scoring", stat: "totalPoints" },
    ],
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchEspnLeaders(sport: string, league: string): Promise<{ leaders: Leader[]; statColumns?: StatColumn[] }> {
  const spec = ESPN_LEADERS[league];
  if (!spec) return { leaders: [] };
  const url = `https://site.web.api.espn.com/apis/common/v3/sports/${sport}/${league}/statistics/byathlete?region=us&lang=en&limit=25&sort=${encodeURIComponent(spec.sort)}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" }, next: { revalidate: 3600 } });
  if (!res.ok) return { leaders: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j: any = await res.json();

  // Build a category → { statName → columnIndex } map from the response's
  // category definitions so we can read each athlete's values positionally.
  const idx: Record<string, Record<string, number>> = {};
  for (const c of j.categories ?? []) {
    const names: string[] = c.names ?? c.labels ?? [];
    idx[c.name] = Object.fromEntries(names.map((n, i) => [n, i]));
  }
  const readStat = (athlete: { categories?: Array<{ name: string; values?: number[] }> }, cat: string, stat: string): number => {
    const catData = athlete.categories?.find((c) => c.name === cat);
    const i = idx[cat]?.[stat];
    if (!catData || i === undefined) return 0;
    const v = catData.values?.[i];
    return typeof v === "number" ? Math.round(v * 10) / 10 : 0;
  };

  const leaders: Leader[] = (j.athletes ?? []).map((a: { athlete: Record<string, unknown>; categories?: Array<{ name: string; values?: number[] }> }, i: number) => {
    const ath = a.athlete as {
      id?: string | number; displayName?: string; teamShortName?: string; teamName?: string;
      position?: { abbreviation?: string };
    };
    const vals: Record<string, number> = {};
    for (const col of spec.cols) vals[col.key] = readStat(a, col.cat, col.stat);
    return {
      playerId: ath.id ?? i,
      name: ath.displayName ?? "",
      team: ath.teamShortName ?? ath.teamName ?? "",
      position: ath.position?.abbreviation,
      gamesPlayed: vals.gamesPlayed ?? vals.gp ?? 0,
      goals: vals.goals ?? 0,
      assists: vals.assists ?? 0,
      points: vals.points ?? vals.pts ?? 0,
      stats: vals,
    };
  });

  // NHL renders through the hockey G/A/P table, so no custom columns needed.
  const statColumns = spec.nativeHockey ? undefined : spec.cols.map((c) => ({ key: c.key, label: c.label, title: c.title }));
  return { leaders, statColumns };
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
  team?: string;         // full club name, e.g. "Esbjerg Energy"
  short_team: string;    // short, e.g. "Esbjerg" (sometimes "Herning (HER)")
  pos?: string;
  games_played: number;
  points: number;
  goals: number;
  assists?: number;        // primary assists only
  total_assists?: number;  // primary + second assists (this is the "A" people expect)
}

/** The Metal Ligaen stats endpoint is **flaky** — the first hit frequently 500s
 *  and a retry succeeds (their own site retries too). So we attempt a few times
 *  with a short backoff instead of giving up on the first failure (which left
 *  the whole top-scorers tab blank). Observed behaviour: their own site retries
 *  ~7 times before the first 200, so we try up to 8 with a short delay. `size`
 *  can be bumped to pull the full field so we can filter to one team's players. */
async function fetchMetalLigaenRows(size = 25, sorter = "points"): Promise<MetalLigaenRow[]> {
  const url = `https://statistik.metalligaen.dk/metal-liga-stats-theme/stats/get?goalies=0&endgame=0&sorter=${sorter}&limit=${size}&page=1&size=${size}`;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "application/json, text/plain, */*",
          "X-Requested-With": "XMLHttpRequest",
          "Referer": "https://statistik.metalligaen.dk/top-25",
        },
        cache: "no-store",
      });
      if (res.ok) {
        const raw: unknown = await res.json();
        // Endpoint returns `{data:[...]}` (current), `{last_page,data:[...]}`, or a bare `[...]`.
        return Array.isArray(raw)
          ? (raw as MetalLigaenRow[])
          : Array.isArray((raw as { data?: unknown }).data)
            ? ((raw as { data: MetalLigaenRow[] }).data)
            : [];
      }
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  return [];
}

function metalRowToLeader(r: MetalLigaenRow): Leader {
  return {
    playerId: r.id,
    name: r.name,
    team: r.team || r.short_team,
    position: r.pos,
    gamesPlayed: r.games_played,
    goals: r.goals,
    assists: r.total_assists ?? r.assists ?? 0,
    points: r.points,
  };
}

/** League top scorers (top 25). */
async function fetchMetalLigaenTopScorers(): Promise<Leader[]> {
  const rows = await fetchMetalLigaenRows(25);
  return rows.map(metalRowToLeader);
}

/** One team's own scorers — pulls the full league field then filters to the
 *  team (matched by keyword against the full + short club name), re-ranked by
 *  points. Answers "show me Esbjerg's goalscorers", not just the league top-25. */
async function fetchMetalLigaenTeamScorers(keyword: string): Promise<Leader[]> {
  const rows = await fetchMetalLigaenRows(400);
  const kw = keyword.toLowerCase();
  return rows
    .filter((r) => (r.team ?? "").toLowerCase().includes(kw) || (r.short_team ?? "").toLowerCase().includes(kw))
    .map(metalRowToLeader)
    .sort((a, b) => b.points - a.points || b.goals - a.goals);
}
