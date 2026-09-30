/**
 * Live playoff bracket for followed US teams (#9 follow-up). Turns out there ARE
 * good live sources — I'd only tested the offseason window before:
 *   • NHL  → the official NHL API's `playoff-bracket/{year}` (full rounds, seeds,
 *            series letters, win counts) — the same feed the EDM hub uses.
 *   • NBA  → ESPN scoreboard postseason games grouped into series by team-pair;
 *            each game carries `competitions[0].series` with per-team win counts.
 *            Rounds separate cleanly by date (a conference's round N+1 can't start
 *            until its round N finishes) and seeds come from the standings.
 *   • NFL  → ESPN scoreboard postseason games grouped by round name (the game's
 *            `notes` headline, e.g. "AFC Divisional Playoffs"); single-elimination.
 *
 * Everything normalises to `LiveBracket`. `available:false` when there's no
 * postseason to show (offseason / not started) — the hub then keeps Projected.
 */

import { espnFetchStandings, type EspnLeaguePath } from "@/lib/espn";

const UA = { "User-Agent": "Mozilla/5.0" };
const ESPN = "https://site.api.espn.com/apis/site/v2/sports";

export interface LiveSide { abbr: string; seed?: number; wins: number }
export interface LiveSeries { conference?: string; top: LiveSide; bottom: LiveSide; bestOf: number; complete: boolean; winner?: string }
export interface LiveRound { name: string; order: number; series: LiveSeries[] }
export interface LiveBracket { available: boolean; sport: "nhl" | "nba" | "nfl"; season: number; rounds: LiveRound[]; myAbbr?: string }

// ── NHL — official API bracket ───────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchNhlBracket(year: number): Promise<LiveBracket | null> {
  try {
    const res = await fetch(`https://api-web.nhle.com/v1/playoff-bracket/${year}`, { headers: UA, next: { revalidate: 300 } });
    if (!res.ok) return null;
    const j = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const series: any[] = j.series ?? [];
    if (series.length === 0) return null;
    const byRound = new Map<number, { name: string; series: LiveSeries[] }>();
    const roundNames: Record<number, string> = { 1: "First Round", 2: "Second Round", 3: "Conference Finals", 4: "Stanley Cup Final" };
    for (const s of series) {
      const round = s.playoffRound ?? 1;
      const top = s.topSeedTeam ?? {}, bot = s.bottomSeedTeam ?? {};
      if (!top.abbrev && !bot.abbrev) continue;
      const tw = s.topSeedWins ?? 0, bw = s.bottomSeedWins ?? 0;
      const item: LiveSeries = {
        top: { abbr: top.abbrev ?? "TBD", seed: s.topSeedRank, wins: tw },
        bottom: { abbr: bot.abbrev ?? "TBD", seed: s.bottomSeedRank, wins: bw },
        bestOf: 7,
        complete: !!s.winningTeamId || tw === 4 || bw === 4,
        winner: s.winningTeamId === top.id ? top.abbrev : s.winningTeamId === bot.id ? bot.abbrev : (tw === 4 ? top.abbrev : bw === 4 ? bot.abbrev : undefined),
      };
      if (!byRound.has(round)) byRound.set(round, { name: s.seriesTitle ?? roundNames[round] ?? `Round ${round}`, series: [] });
      byRound.get(round)!.series.push(item);
    }
    const rounds: LiveRound[] = [...byRound.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([order, r]) => ({ name: r.name, order, series: r.series }));
    return { available: rounds.length > 0, sport: "nhl", season: year, rounds };
  } catch { return null; }
}

// ── ESPN postseason games (NBA / NFL) ────────────────────────────────────────
interface EspnGame { pair: string; teams: [string, string]; date: string; note: string; completed: boolean; scores: Record<string, number>; seriesWins?: Record<string, number> }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchEspnPostseason(path: EspnLeaguePath, from: string, to: string): Promise<EspnGame[]> {
  const url = `${ESPN}/${path.sport}/${path.league}/scoreboard?dates=${from}-${to}&limit=1000`;
  const res = await fetch(url, { headers: UA, next: { revalidate: 300 } });
  if (!res.ok) return [];
  const j = await res.json();
  const out: EspnGame[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const ev of (j.events ?? []) as any[]) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cs: any[] = comp.competitors ?? [];
    const a = cs.find((c) => c.homeAway === "home"), b = cs.find((c) => c.homeAway === "away");
    if (!a?.team?.abbreviation || !b?.team?.abbreviation) continue;
    const note: string = comp.notes?.[0]?.headline ?? "";
    // Only postseason games (skip preseason exhibitions that share the window).
    const isPost = comp.series?.type === "playoff" || /playoff|wild ?card|divisional|conference|championship|super bowl|finals|nba finals|stanley/i.test(note);
    if (!isPost) continue;
    const scores: Record<string, number> = {};
    scores[a.team.abbreviation] = Number(a.score) || 0;
    scores[b.team.abbreviation] = Number(b.score) || 0;
    let seriesWins: Record<string, number> | undefined;
    if (comp.series?.competitors) {
      seriesWins = {};
      // series competitors are keyed by team id; map back via the game's competitors
      for (const c of cs) {
        const sc = comp.series.competitors.find((x: { id: string }) => x.id === c.team?.id);
        if (sc) seriesWins[c.team.abbreviation] = sc.wins ?? 0;
      }
    }
    const teams: [string, string] = [a.team.abbreviation, b.team.abbreviation];
    out.push({ pair: [...teams].sort().join("|"), teams, date: (ev.date ?? "").slice(0, 10), note, completed: !!comp.status?.type?.completed, scores, seriesWins });
  }
  return out;
}

/** Seed map (conference seed) + conference name per team abbr, from ESPN standings. */
async function seedMap(path: EspnLeaguePath): Promise<Map<string, { seed?: number; conf?: string }>> {
  const m = new Map<string, { seed?: number; conf?: string }>();
  try {
    const rows = await espnFetchStandings(path);
    for (const r of rows) m.set(r.abbr, { seed: r.seed || r.groupRank, conf: r.group });
  } catch { /* seeds optional */ }
  return m;
}

function shortConf(name?: string): string | undefined {
  if (!name) return undefined;
  if (/american football conference/i.test(name)) return "AFC";
  if (/national football conference/i.test(name)) return "NFC";
  if (/eastern conference/i.test(name)) return "East";
  if (/western conference/i.test(name)) return "West";
  return name.replace(/\s+Conference$/i, "");
}

// ── NBA — series grouped by team-pair, rounds by date within a conference ─────
function buildNbaBracket(games: EspnGame[], seeds: Map<string, { seed?: number; conf?: string }>, year: number): LiveBracket {
  const byPair = new Map<string, EspnGame[]>();
  for (const g of games) {
    if (!byPair.has(g.pair)) byPair.set(g.pair, []);
    byPair.get(g.pair)!.push(g);
  }
  interface S { teams: [string, string]; wins: Record<string, number>; earliest: string; conf?: string }
  const seriesList: S[] = [];
  for (const [, gs] of byPair) {
    gs.sort((a, b) => a.date.localeCompare(b.date));
    const teams = gs[gs.length - 1].teams;
    // Best series-win figure seen (series.competitors is cumulative on the latest game).
    const wins: Record<string, number> = { [teams[0]]: 0, [teams[1]]: 0 };
    for (const g of gs) if (g.seriesWins) for (const t of teams) wins[t] = Math.max(wins[t], g.seriesWins[t] ?? 0);
    const c0 = seeds.get(teams[0])?.conf, c1 = seeds.get(teams[1])?.conf;
    const conf = c0 && c1 && c0 === c1 ? c0 : undefined; // undefined = cross-conference (Finals)
    seriesList.push({ teams, wins, earliest: gs[0].date, conf });
  }
  // Rounds: within each conference, order by earliest date → R1 (4) · Semis (2) · Conf Final (1); cross-conf = Finals.
  const roundsMap = new Map<string, LiveSeries[]>();
  const push = (name: string, s: S) => {
    const mk = (t: string): LiveSide => ({ abbr: t, seed: seeds.get(t)?.seed, wins: s.wins[t] ?? 0 });
    const [top, bottom] = [...s.teams].sort((a, b) => (seeds.get(a)?.seed ?? 99) - (seeds.get(b)?.seed ?? 99));
    const complete = s.wins[top] === 4 || s.wins[bottom] === 4;
    const item: LiveSeries = { conference: shortConf(s.conf), top: mk(top), bottom: mk(bottom), bestOf: 7, complete, winner: s.wins[top] === 4 ? top : s.wins[bottom] === 4 ? bottom : undefined };
    if (!roundsMap.has(name)) roundsMap.set(name, []);
    roundsMap.get(name)!.push(item);
  };
  const NBA_ROUNDS = ["First Round", "Conference Semis", "Conference Finals"];
  for (const conf of new Set(seriesList.filter((s) => s.conf).map((s) => s.conf))) {
    const inConf = seriesList.filter((s) => s.conf === conf).sort((a, b) => a.earliest.localeCompare(b.earliest));
    inConf.forEach((s, i) => push(NBA_ROUNDS[i < 4 ? 0 : i < 6 ? 1 : 2], s));
  }
  for (const s of seriesList.filter((s) => !s.conf)) push("NBA Finals", s);

  const order = ["First Round", "Conference Semis", "Conference Finals", "NBA Finals"];
  const rounds: LiveRound[] = order.filter((n) => roundsMap.has(n)).map((n, i) => ({ name: n, order: i + 1, series: roundsMap.get(n)! }));
  return { available: rounds.length > 0, sport: "nba", season: year, rounds };
}

// ── NFL — single-elimination, rounds by the game's note headline ──────────────
function buildNflBracket(games: EspnGame[], seeds: Map<string, { seed?: number; conf?: string }>, year: number): LiveBracket {
  const roundOf = (note: string): string => {
    if (/super bowl/i.test(note)) return "Super Bowl";
    if (/champ/i.test(note)) return "Conference Championship";
    if (/divisional/i.test(note)) return "Divisional";
    if (/wild ?card/i.test(note)) return "Wild Card";
    return "Playoffs";
  };
  const roundsMap = new Map<string, LiveSeries[]>();
  for (const g of games) {
    const name = roundOf(g.note);
    const [top, bottom] = [...g.teams].sort((a, b) => (seeds.get(a)?.seed ?? 99) - (seeds.get(b)?.seed ?? 99));
    const winner = g.completed ? (g.scores[top] > g.scores[bottom] ? top : bottom) : undefined;
    const item: LiveSeries = {
      conference: shortConf(seeds.get(top)?.conf),
      top: { abbr: top, seed: seeds.get(top)?.seed, wins: g.scores[top] },
      bottom: { abbr: bottom, seed: seeds.get(bottom)?.seed, wins: g.scores[bottom] },
      bestOf: 1, complete: g.completed, winner,
    };
    if (!roundsMap.has(name)) roundsMap.set(name, []);
    roundsMap.get(name)!.push(item);
  }
  const order = ["Wild Card", "Divisional", "Conference Championship", "Super Bowl"];
  const rounds: LiveRound[] = order.filter((n) => roundsMap.has(n)).map((n, i) => ({ name: n, order: i + 1, series: roundsMap.get(n)! }));
  return { available: rounds.length > 0, sport: "nfl", season: year, rounds };
}

// ── Entry point ──────────────────────────────────────────────────────────────
export async function fetchLiveBracket(
  sport: "nhl" | "nba" | "nfl",
  path: EspnLeaguePath,
  year: number,
): Promise<LiveBracket> {
  if (sport === "nhl") {
    return (await fetchNhlBracket(year)) ?? { available: false, sport, season: year, rounds: [] };
  }
  // NBA (spring) vs NFL (Jan–Feb of the following calendar year) date windows.
  const [from, to] = sport === "nba" ? [`${year}0415`, `${year}0701`] : [`${year}0101`, `${year}0215`];
  const [games, seeds] = await Promise.all([fetchEspnPostseason(path, from, to), seedMap(path)]);
  if (games.length === 0) return { available: false, sport, season: year, rounds: [] };
  return sport === "nba" ? buildNbaBracket(games, seeds, year) : buildNflBracket(games, seeds, year);
}
