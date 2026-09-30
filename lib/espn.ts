/**
 * ESPN hidden-API provider for US major leagues (NBA / NFL / NHL). Free, no
 * key. One provider backs all three — the only per-league difference is the
 * `{ sport, league }` path pair and how a record reads (NBA = W-L, NFL adds
 * ties, NHL adds OT losses + a real points column).
 *
 * CORS blocks some of these endpoints from a browser, but server-side (our API
 * routes) there's no such restriction. Standings entries embed the team
 * objects, so the catalogue's team list is derived from the standings feed
 * (no separate — and CORS-flaky — /teams call needed).
 */

const BASE = "https://site.api.espn.com/apis";
const UA = { "User-Agent": "DashboardApp/1.0" };

export interface EspnLeaguePath {
  sport: string;  // "basketball" | "football" | "hockey"
  league: string; // "nba" | "nfl" | "nhl"
}

export interface EspnStandingRow {
  teamId: string;
  name: string;
  abbr: string;
  wins: number;
  losses: number;
  ties: number;         // NFL only (0 elsewhere)
  otLosses?: number;    // NHL only
  points?: number;      // NHL only (real standings points)
  winPercent: number;
  seed: number;         // conference playoff seed
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  group?: string;       // conference name (e.g. "Western Conference")
  groupRank?: number;   // rank within the conference (1-based)
  division?: string;    // division name (e.g. "Pacific Division") — from ?level=3
  divisionRank?: number;// rank within the division (1-based)
}

export interface EspnGame {
  id: string;         // ESPN event id — used to fetch the game's scoring summary
  date: string;       // YYYY-MM-DD (UTC)
  time: string;       // HH:MM (UTC)
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  finished: boolean;
}

/** One scoring play from an ESPN game summary (last-5 dropdown). */
export interface EspnScoringPlay {
  period: number;
  clock: string;      // "13:39"
  text: string;       // "Porter Martone Goal (2) Backhand, assists: …"
  homeScore: number;  // running score after the play
  awayScore: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function statVal(entry: any, name: string): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = (entry.stats ?? []).find((x: any) => x.name === name);
  const v = s?.value;
  return typeof v === "number" ? v : 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function espnEntryToRow(e: any, group?: string): EspnStandingRow {
  const hasOt = (e.stats ?? []).some((s: { name: string }) => s.name === "otLosses");
  // Only the NHL has a *real* standings points column. NBA also exposes a
  // "points" stat but it isn't standings points — gate on otLosses (an NHL-only
  // field) so NBA/NFL fall back to a win-count elsewhere.
  const hasPts = hasOt && (e.stats ?? []).some((s: { name: string }) => s.name === "points");
  return {
    teamId: String(e.team?.id ?? ""),
    name: e.team?.displayName ?? e.team?.name ?? "",
    abbr: e.team?.abbreviation ?? "",
    wins: statVal(e, "wins"),
    losses: statVal(e, "losses"),
    ties: statVal(e, "ties"),
    otLosses: hasOt ? statVal(e, "otLosses") : undefined,
    points: hasPts ? statVal(e, "points") : undefined,
    winPercent: statVal(e, "winPercent"),
    seed: statVal(e, "playoffSeed"),
    pointsFor: statVal(e, "pointsFor"),
    pointsAgainst: statVal(e, "pointsAgainst"),
    pointDiff: statVal(e, "pointDifferential"),
    group,
  };
}

/** Recursively collect leaf standings groups (conference/division) with names. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectGroups(node: any, inheritedName?: string): Array<{ name?: string; rows: EspnStandingRow[] }> {
  const name = node.name ?? node.shortName ?? inheritedName;
  const entries = node.standings?.entries;
  const kids = node.children;
  // A node with nested children (e.g. conference → divisions) recurses so we use
  // the most specific group name available.
  if (Array.isArray(kids) && kids.length > 0) {
    return kids.flatMap((k: unknown) => collectGroups(k, name));
  }
  if (Array.isArray(entries) && entries.length > 0) {
    const rows = entries.map((e: unknown) => espnEntryToRow(e, name));
    // Rank within the group by playoff seed (if present) else win%.
    const ranked = rows.slice().sort((a, b) => (a.seed || 999) - (b.seed || 999) || b.winPercent - a.winPercent);
    ranked.forEach((r, i) => { r.groupRank = i + 1; });
    return [{ name, rows }];
  }
  return [];
}

/**
 * Fetch the division-level standings (`?level=3`) and return a teamId → division
 * info map. All three US leagues nest divisions inside conferences; the default
 * standings endpoint only exposes the conference level, so this is a second
 * (parallel) call. Each row still carries its conference `seed`, so division
 * grouping loses nothing. Division rank is by playoff seed (fallback win%).
 */
async function fetchDivisionMap(path: EspnLeaguePath): Promise<Map<string, { division: string; divisionRank: number }>> {
  const map = new Map<string, { division: string; divisionRank: number }>();
  try {
    const res = await fetch(`${BASE}/v2/sports/${path.sport}/${path.league}/standings?level=3`, {
      headers: UA,
      next: { revalidate: 600 },
    });
    if (!res.ok) return map;
    const j = await res.json();
    const groups = (j.children ?? []).flatMap((c: unknown) => collectGroups(c));
    for (const g of groups as Array<{ name?: string; rows: EspnStandingRow[] }>) {
      if (!g.name) continue;
      g.rows.forEach((r) => {
        if (r.teamId) map.set(r.teamId, { division: g.name!, divisionRank: r.groupRank ?? 0 });
      });
    }
  } catch { /* division grouping is a nicety — ignore failures */ }
  return map;
}

export async function espnFetchStandings(path: EspnLeaguePath): Promise<EspnStandingRow[]> {
  try {
    const [res, divisionMap] = await Promise.all([
      fetch(`${BASE}/v2/sports/${path.sport}/${path.league}/standings`, {
        headers: UA,
        next: { revalidate: 600 },
      }),
      fetchDivisionMap(path),
    ]);
    if (!res.ok) return [];
    const j = await res.json();
    const groups = (j.children ?? []).flatMap((c: unknown) => collectGroups(c));
    const rows: EspnStandingRow[] = groups.flatMap((g: { rows: EspnStandingRow[] }) => g.rows);
    // Attach division context (EDM shows division rank; conferences drive the
    // playoff bracket/seeding).
    for (const r of rows) {
      const div = divisionMap.get(r.teamId);
      if (div) { r.division = div.division; r.divisionRank = div.divisionRank; }
    }
    // Overall rank = win% desc (US leagues rank within conferences, but a single
    // ordered table is what the standings UI expects). groupRank/group carry the
    // conference context (the NA-sports equivalent of a league position).
    rows.sort((a, b) => b.winPercent - a.winPercent || b.pointDiff - a.pointDiff);
    return rows;
  } catch {
    return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scoreOf(c: any): number | null {
  const raw = c?.score;
  const v = raw && typeof raw === "object" ? raw.value : raw;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Parse one ESPN team-schedule payload into completed + upcoming games. */
function parseSchedule(j: { events?: unknown[]; season?: { year?: number } }): { past: EspnGame[]; future: EspnGame[]; seasonYear: number | null } {
  const past: EspnGame[] = [];
  const future: EspnGame[] = [];
  for (const ev of (j.events as Array<Record<string, unknown>>) ?? []) {
    const comp = (ev.competitions as Array<Record<string, unknown>> | undefined)?.[0];
    if (!comp) continue;
    const competitors = (comp.competitors as Array<{ homeAway: string; team?: { displayName?: string; abbreviation?: string } }>) ?? [];
    const home = competitors.find((c) => c.homeAway === "home");
    const away = competitors.find((c) => c.homeAway === "away");
    if (!home || !away) continue;
    const finished = !!(comp.status as { type?: { completed?: boolean } } | undefined)?.type?.completed;
    const iso: string = (ev.date as string) ?? (comp.date as string) ?? "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) continue;
    const game: EspnGame = {
      id: String((ev.id as string | number | undefined) ?? (comp.id as string | number | undefined) ?? ""),
      date: iso.slice(0, 10),
      time: iso.slice(11, 16),
      homeTeam: home.team?.displayName ?? home.team?.abbreviation ?? "",
      awayTeam: away.team?.displayName ?? away.team?.abbreviation ?? "",
      homeScore: finished ? scoreOf(home) : null,
      awayScore: finished ? scoreOf(away) : null,
      finished,
    };
    (finished ? past : future).push(game);
  }
  past.sort((a, b) => a.date.localeCompare(b.date));
  future.sort((a, b) => a.date.localeCompare(b.date));
  return { past, future, seasonYear: typeof j.season?.year === "number" ? j.season.year : null };
}

async function fetchSchedule(path: EspnLeaguePath, teamId: string, season?: number) {
  const qs = season ? `?season=${season}` : "";
  const res = await fetch(`${BASE}/site/v2/sports/${path.sport}/${path.league}/teams/${teamId}/schedule${qs}`, {
    headers: UA,
    next: { revalidate: 900 },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function espnFetchTeamGames(path: EspnLeaguePath, teamId: string): Promise<{ last5: EspnGame[]; next5: EspnGame[] }> {
  try {
    const j = await fetchSchedule(path, teamId);
    if (!j) return { last5: [], next5: [] };
    const { past, future, seasonYear } = parseSchedule(j);

    // Offseason: the current schedule can be all-upcoming (no completed games),
    // leaving the box bare next to in-season teams. Backfill last season's final
    // results so "recent form" still shows something.
    let allPast = past;
    if (past.length === 0) {
      const prevYear = (seasonYear ?? new Date().getFullYear()) - 1;
      const prev = await fetchSchedule(path, teamId, prevYear).catch(() => null);
      if (prev) allPast = parseSchedule(prev).past;
    }

    return { last5: allPast.slice(-5), next5: future.slice(0, 5) };
  } catch {
    return { last5: [], next5: [] };
  }
}

/**
 * A completed game's scoring plays, for the last-5 dropdown. ESPN's game
 * `summary` endpoint carries a full `plays[]`; the ones with `scoringPlay: true`
 * are the goals (NHL) / touchdowns + field goals (NFL) with a running score and
 * a descriptive `text` (scorer + assists). NBA is intentionally excluded — a
 * basketball game has 100+ scoring plays, which isn't a useful "goal timeline".
 */
export async function espnFetchGameScoring(path: EspnLeaguePath, eventId: string): Promise<EspnScoringPlay[]> {
  if (!eventId) return [];
  try {
    const res = await fetch(`${BASE}/site/v2/sports/${path.sport}/${path.league}/summary?event=${eventId}`, {
      headers: UA,
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const j = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plays: any[] = Array.isArray(j.scoringPlays) && j.scoringPlays.length ? j.scoringPlays : (j.plays ?? []);
    return plays
      .filter((p) => p?.scoringPlay === true || /goal|touchdown|field goal/i.test(p?.type?.text ?? ""))
      .map((p) => ({
        period: Number(p.period?.number ?? p.period ?? 0) || 0,
        clock: String(p.clock?.displayValue ?? p.clock ?? ""),
        text: String(p.text ?? p.type?.text ?? ""),
        homeScore: Number(p.homeScore ?? 0) || 0,
        awayScore: Number(p.awayScore ?? 0) || 0,
      }));
  } catch {
    return [];
  }
}
