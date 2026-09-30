/**
 * FACEIT (CS2) integration — client-safe (no `fs`). Types + level colours +
 * the FACEIT Data API client. The API key is the author's, bundled as
 * `FACEIT_API_KEY` (from developers.faceit.com) exactly like the Riot key —
 * users only add their FACEIT nickname. Account file storage lives in the
 * route (fs), not here, so this module stays importable from client components.
 *
 * The fetch helpers read `process.env.FACEIT_API_KEY`; they only ever run
 * server-side (from the summary route), so the client bundle never touches it.
 */

const BASE = "https://open.faceit.com/data/v4";

export interface FaceitAccount {
  id: string;
  nickname: string;
  playerId?: string;   // resolved on add when a key is present
  addedAt: string;
}

export interface FaceitStats {
  matches: number | null;
  winRatePct: number | null;
  kd: number | null;
  hsPct: number | null;
  currentWinStreak: number | null;
  longestWinStreak: number | null;
}

export interface FaceitSummary {
  account: FaceitAccount;
  playerId: string | null;
  nickname: string;
  avatar?: string;
  country?: string;
  skillLevel: number | null;
  elo: number | null;
  region?: string;
  stats: FaceitStats | null;
  /** Last matches as booleans (true = win), newest first. From lifetime "Recent Results". */
  recent: boolean[];
  error?: string;
  needsKey?: boolean;
}

/** One recent match, from the per-match player-stats feed. */
export interface FaceitMatchRow {
  matchId: string;
  map: string;
  win: boolean;
  kills: number; deaths: number; assists: number;
  kd: number | null; kr: number | null; adr: number | null; hsPct: number | null;
  rounds: number | null;
  score: string;          // "13 / 3"
  mode: string;           // "5v5"
  createdAt: string;      // ISO
}

/** Aggregate over the recent match window (last N). */
export interface Faceit30Stats {
  matches: number;
  wins: number; losses: number;
  winRatePct: number | null;
  avgKd: number | null; avgKr: number | null; avgAdr: number | null; hsPct: number | null;
}

/** One player's row in a full match scoreboard. */
export interface FaceitScorePlayer {
  playerId: string; nickname: string;
  kills: number; deaths: number; assists: number;
  kd: number | null; adr: number | null; hsPct: number | null; mvps: number | null;
}
export interface FaceitScoreTeam {
  name: string; win: boolean; score: string; players: FaceitScorePlayer[];
}
export interface FaceitScoreboard {
  matchId: string; map: string; score: string;
  teams: FaceitScoreTeam[];
}

// FACEIT skill-level palette (1..10) — greys → greens → yellows → oranges → red.
export const FACEIT_LEVEL_COLORS: Record<number, string> = {
  1: "#eeeeee", 2: "#1ce400", 3: "#1ce400", 4: "#ffc800", 5: "#ffc800",
  6: "#ffc800", 7: "#ff6309", 8: "#ff6309", 9: "#fe1f00", 10: "#fe1f00",
};
export function levelColor(level: number | null | undefined): string {
  if (!level || level < 1) return "var(--text-muted)";
  return FACEIT_LEVEL_COLORS[Math.min(10, Math.max(1, Math.round(level)))] ?? "var(--text-muted)";
}

export function hasFaceitKey(): boolean {
  return !!process.env.FACEIT_API_KEY;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function faceitFetch<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  const key = process.env.FACEIT_API_KEY;
  if (!key) return { ok: false, status: 503 };
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 0 };
  }
}

interface FaceitPlayer {
  player_id: string;
  nickname: string;
  avatar?: string;
  country?: string;
  games?: Record<string, { skill_level?: number; faceit_elo?: number; region?: string } | undefined>;
}

/** Resolve a nickname → player_id (+ basic profile). Null on any failure. */
export async function fetchPlayerByNickname(nickname: string): Promise<FaceitPlayer | null> {
  const r = await faceitFetch<FaceitPlayer>(`/players?nickname=${encodeURIComponent(nickname)}`);
  return r.ok ? r.data : null;
}

/** Pick the CS2 game block (falls back to legacy csgo). */
function cs2Block(player: FaceitPlayer) {
  return player.games?.cs2 ?? player.games?.csgo;
}

/** Build the full summary for one account. Never throws. */
export async function buildFaceitSummary(account: FaceitAccount): Promise<FaceitSummary> {
  const base: FaceitSummary = {
    account, playerId: account.playerId ?? null, nickname: account.nickname,
    skillLevel: null, elo: null, stats: null, recent: [],
  };
  if (!hasFaceitKey()) return { ...base, needsKey: true, error: "No FACEIT API key configured." };

  const player = await fetchPlayerByNickname(account.nickname);
  if (!player) return { ...base, error: `Couldn't find FACEIT player "${account.nickname}".` };

  const g = cs2Block(player);
  const summary: FaceitSummary = {
    ...base,
    playerId: player.player_id,
    nickname: player.nickname,
    avatar: player.avatar,
    country: player.country,
    skillLevel: g?.skill_level ?? null,
    elo: g?.faceit_elo ?? null,
    region: g?.region,
  };

  // Lifetime stats — CS2, fall back to CSGO.
  const gameId = player.games?.cs2 ? "cs2" : player.games?.csgo ? "csgo" : "cs2";
  const statsRes = await faceitFetch<{ lifetime?: Record<string, unknown> }>(`/players/${player.player_id}/stats/${gameId}`);
  if (statsRes.ok && statsRes.data.lifetime) {
    const L = statsRes.data.lifetime;
    summary.stats = {
      matches: num(L["Matches"]),
      winRatePct: num(L["Win Rate %"]),
      kd: num(L["Average K/D Ratio"] ?? L["K/D Ratio"]),
      hsPct: num(L["Average Headshots %"] ?? L["Total Headshots %"]),
      currentWinStreak: num(L["Current Win Streak"]),
      longestWinStreak: num(L["Longest Win Streak"]),
    };
    const rr = L["Recent Results"];
    if (Array.isArray(rr)) summary.recent = rr.map((x) => String(x) === "1").reverse();
  }
  return summary;
}

/* ───────────────────── match history + scoreboards ─────────────────────── */

/** Resolve an account's player_id (uses the stored id, else looks it up). */
async function resolvePlayerId(account: FaceitAccount): Promise<string | null> {
  if (account.playerId) return account.playerId;
  const p = await fetchPlayerByNickname(account.nickname);
  return p?.player_id ?? null;
}

type RawStats = Record<string, unknown>;

/** Recent matches (per-match player stats) — one call gives history + stats. */
export async function fetchPlayerMatches(account: FaceitAccount, limit = 30): Promise<FaceitMatchRow[] | null> {
  const playerId = await resolvePlayerId(account);
  if (!playerId) return null;
  // Immutable once played — cache long.
  const r = await faceitFetch<{ items?: Array<{ stats?: RawStats }> }>(
    `/players/${playerId}/games/cs2/stats?limit=${Math.min(Math.max(limit, 1), 100)}`,
  );
  if (!r.ok) return null;
  return (r.data.items ?? []).map((it) => {
    const s = it.stats ?? {};
    return {
      matchId: String(s["Match Id"] ?? ""),
      map: String(s["Map"] ?? ""),
      win: String(s["Result"] ?? "") === "1",
      kills: num(s["Kills"]) ?? 0,
      deaths: num(s["Deaths"]) ?? 0,
      assists: num(s["Assists"]) ?? 0,
      kd: num(s["K/D Ratio"]),
      kr: num(s["K/R Ratio"]),
      adr: num(s["ADR"] ?? s["Average Damage per Round"]),
      hsPct: num(s["Headshots %"]),
      rounds: num(s["Rounds"]),
      score: String(s["Score"] ?? ""),
      mode: String(s["Game Mode"] ?? ""),
      createdAt: String(s["Created At"] ?? ""),
    };
  });
}

/** Aggregate stats over a set of match rows. */
export function computeRecentStats(rows: FaceitMatchRow[]): Faceit30Stats {
  const n = rows.length;
  const wins = rows.filter((r) => r.win).length;
  const avg = (pick: (r: FaceitMatchRow) => number | null) => {
    const vals = rows.map(pick).filter((v): v is number => v != null);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
  };
  return {
    matches: n, wins, losses: n - wins,
    winRatePct: n ? Math.round((wins / n) * 100) : null,
    avgKd: avg((r) => r.kd), avgKr: avg((r) => r.kr), avgAdr: avg((r) => r.adr), hsPct: avg((r) => r.hsPct),
  };
}

/** Full scoreboard for one match (both teams, all players). */
export async function fetchMatchScoreboard(matchId: string): Promise<FaceitScoreboard | null> {
  const r = await faceitFetch<{ rounds?: Array<{ round_stats?: RawStats; teams?: Array<{ team_stats?: RawStats; players?: Array<{ player_id: string; nickname: string; player_stats?: RawStats }> }> }> }>(
    `/matches/${encodeURIComponent(matchId)}/stats`,
  );
  if (!r.ok) return null;
  const round = r.data.rounds?.[0];
  if (!round) return null;
  const rs = round.round_stats ?? {};
  const teams: FaceitScoreTeam[] = (round.teams ?? []).map((t) => {
    const ts = t.team_stats ?? {};
    return {
      name: String(ts["Team"] ?? ""),
      win: String(ts["Team Win"] ?? "") === "1",
      score: String(ts["Final Score"] ?? ""),
      players: (t.players ?? []).map((p) => {
        const ps = p.player_stats ?? {};
        return {
          playerId: p.player_id, nickname: p.nickname,
          kills: num(ps["Kills"]) ?? 0, deaths: num(ps["Deaths"]) ?? 0, assists: num(ps["Assists"]) ?? 0,
          kd: num(ps["K/D Ratio"]), adr: num(ps["ADR"]), hsPct: num(ps["Headshots %"]), mvps: num(ps["MVPs"]),
        };
      }).sort((a, b) => b.kills - a.kills),
    };
  });
  return { matchId, map: String(rs["Map"] ?? ""), score: String(rs["Score"] ?? ""), teams };
}
