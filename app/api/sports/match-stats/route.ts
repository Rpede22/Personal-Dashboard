import { NextResponse } from "next/server";

/**
 * GET /api/sports/match-stats?matchId=<fotmobMatchId>
 *
 * Fetches FotMob's `matchDetails` endpoint and pulls the small set of key
 * stats we render in the expanded match panel: ball possession, total shots,
 * shots on target, expected goals (xG), and each side's starting formation.
 *
 * FotMob is a large, weakly-typed JSON payload; every field is looked up
 * defensively so a schema tweak upstream doesn't 500 the whole panel — the
 * response returns `null` for any stat that couldn't be located.
 */

interface StatRow { home: string | number | null; away: string | number | null }
interface MatchStatsPayload {
  homeTeam: string | null;
  awayTeam: string | null;
  possession: StatRow | null;
  shotsTotal: StatRow | null;
  shotsOnTarget: StatRow | null;
  xg: StatRow | null;
  formationHome: string | null;
  formationAway: string | null;
}

const CACHE_TTL = 60 * 60 * 1000; // 1 h — finished match stats never change
const cache = new Map<string, { data: MatchStatsPayload; ts: number }>();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get("matchId");
  if (!matchId) return NextResponse.json({ error: "matchId required" }, { status: 400 });

  const cached = cache.get(matchId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return NextResponse.json(cached.data);

  try {
    const res = await fetch(`https://www.fotmob.com/api/data/matchDetails?matchId=${matchId}`, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`FotMob ${res.status}`);
    const j: unknown = await res.json();
    const stats = extract(j);
    cache.set(matchId, { data: stats, ts: Date.now() });
    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function asArr(v: unknown): unknown[] | null {
  return Array.isArray(v) ? v : null;
}

/**
 * Recursively walk any FotMob payload looking for a stats row whose title
 * matches one of the given aliases. Titles vary by locale / version, so we
 * pattern-match case-insensitive substrings.
 */
function findStatByTitle(root: unknown, titleAliases: string[]): StatRow | null {
  const aliases = titleAliases.map((s) => s.toLowerCase());
  const seen = new WeakSet<object>();
  function visit(node: unknown): StatRow | null {
    if (!node || typeof node !== "object") return null;
    if (seen.has(node as object)) return null;
    seen.add(node as object);
    if (Array.isArray(node)) {
      for (const child of node) {
        const hit = visit(child);
        if (hit) return hit;
      }
      return null;
    }
    const obj = node as Record<string, unknown>;
    const title = typeof obj.title === "string" ? obj.title.toLowerCase() : null;
    if (title && aliases.some((a) => title.includes(a))) {
      const pair = asArr(obj.stats);
      if (pair && pair.length >= 2) {
        return {
          home: coerceStat(pair[0]),
          away: coerceStat(pair[1]),
        };
      }
    }
    for (const v of Object.values(obj)) {
      const hit = visit(v);
      if (hit) return hit;
    }
    return null;
  }
  return visit(root);
}

function coerceStat(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  const obj = asObj(v);
  if (obj) {
    if (typeof obj.value === "number" || typeof obj.value === "string") return obj.value as string | number;
    if (typeof obj.label === "string") return obj.label;
  }
  return null;
}

function extract(root: unknown): MatchStatsPayload {
  const obj = asObj(root);
  const header = obj ? asObj(obj.header) : null;
  const teams = header ? asArr(header.teams) : null;
  const homeTeam = teams && teams[0] ? (asObj(teams[0])?.name as string | undefined) ?? null : null;
  const awayTeam = teams && teams[1] ? (asObj(teams[1])?.name as string | undefined) ?? null : null;

  // Lineup formations
  const content = obj ? asObj(obj.content) : null;
  const lineup = content ? asObj(content.lineup) : null;
  const lineupSides = lineup ? asArr(lineup.lineup) : null;
  const formationHome = lineupSides && lineupSides[0] ? (asObj(lineupSides[0])?.lineup as string | undefined) ?? null : null;
  const formationAway = lineupSides && lineupSides[1] ? (asObj(lineupSides[1])?.lineup as string | undefined) ?? null : null;

  return {
    homeTeam,
    awayTeam,
    possession:    findStatByTitle(root, ["ball possession", "possession"]),
    shotsTotal:    findStatByTitle(root, ["total shots", "shots"]),
    shotsOnTarget: findStatByTitle(root, ["shots on target", "on target"]),
    xg:            findStatByTitle(root, ["expected goals", "xg"]),
    formationHome,
    formationAway,
  };
}
