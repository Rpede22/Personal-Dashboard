/**
 * Teamfight Tactics (TFT) — client-safe types + keyed Riot client.
 *
 * Reuses the same `RIOT_API_KEY` as the LoL hub, BUT TFT lives behind its own
 * Riot **product**: a production key scoped to LoL alone gets a 403 on every
 * `tft/*` endpoint (Account-v1 still works, since it's shared). So the summary
 * degrades to `needsAccess` on 403 — the hub then explains that TFT product
 * access (or a 24h dev key, which grants all products) is required. Everything
 * lights up the moment the key can see TFT.
 *
 * Routing (same split as LoL): platform (`euw1`, `na1`, `kr`, …) for league +
 * summoner; regional (`europe`/`americas`/`asia`/`sea`) for match. Fetches read
 * the env var, so they run server-side only.
 */

import { toRegional } from "@/lib/riot";

/**
 * Riot issues **per-product** production keys, so TFT needs its own key string
 * separate from the LoL one. We read `RIOT_TFT_API_KEY` first and fall back to
 * `RIOT_API_KEY` (covers the 24h dev-key case, where one key grants all
 * products). Everything in the TFT feature — including the shared Account-v1
 * puuid lookup — uses this key, so TFT works even with no LoL key present.
 */
function tftKey(): string {
  return process.env.RIOT_TFT_API_KEY ?? process.env.RIOT_API_KEY ?? "";
}

export function hasTftKey(): boolean {
  return !!tftKey();
}

export interface TftAccount {
  id: string;
  gameName: string;
  tagLine: string;
  region: string;   // platform region, e.g. "euw1"
  puuid?: string;    // captured on first successful summary
  addedAt: string;
}

export interface TftRank {
  queueType: string;     // "RANKED_TFT" | "RANKED_TFT_DOUBLE_UP" | "RANKED_TFT_TURBO"
  tier: string;          // "DIAMOND" | "GOLD" | … (or "" for unranked)
  rank: string;          // "I".."IV"
  lp: number;
  wins: number;          // TFT "wins" = top-4 finishes
  losses: number;
}

export interface TftMatchResult {
  matchId: string;
  placement: number;     // 1..8
  level: number;
  queueId: number;
  gameDatetimeMs: number;
}

export interface TftSummary {
  account: TftAccount;
  ranks: TftRank[];
  recent: TftMatchResult[];
  avgPlacement: number | null;
  top4Rate: number | null;   // 0..1
  firsts: number;
  needsKey?: boolean;
  needsAccess?: boolean;     // key present but no TFT product access (403)
  error?: string;
}

/** Ranked-emblem icon for a TFT tier (shared Community Dragon emblems with LoL). */
export function tftRankedEmblem(tier: string): string {
  const t = (tier || "unranked").toLowerCase();
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${t}.png`;
}

/** Colour a placement: 1st gold, 2–4 green (top-4), 5–8 red. */
export function placementColor(p: number): string {
  if (p === 1) return "var(--accent-orange)";
  if (p <= 4) return "var(--accent-green)";
  return "var(--accent-red)";
}

/* ─────────────────────────────── keyed client ─────────────────────────── */

interface RiotResult<T> { ok: boolean; status: number; data?: T }

async function tftFetch<T>(url: string, revalidate: number): Promise<RiotResult<T>> {
  const key = tftKey();
  if (!key) return { ok: false, status: 503 };
  try {
    const res = await fetch(url, { headers: { "X-Riot-Token": key }, next: { revalidate } });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, status: 200, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 0 };
  }
}

/**
 * Resolve a Riot ID → puuid via the shared Account-v1 endpoint, using the TFT
 * key. Account-v1 is product-agnostic, so this works with either key. Returns
 * the raw fetch result so callers can distinguish 403 / 404.
 */
export async function resolveTftAccount(gameName: string, tagLine: string, region: string): Promise<RiotResult<{ puuid: string }>> {
  const regional = toRegional((region || "euw1").toLowerCase());
  return tftFetch<{ puuid: string }>(
    `https://${regional}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
    60 * 60 * 24,
  );
}

interface RawTftLeagueEntry { queueType?: string; tier?: string; rank?: string; leaguePoints?: number; wins?: number; losses?: number }
interface RawTftMatch { metadata?: { match_id?: string }; info?: { queue_id?: number; game_datetime?: number; participants?: Array<{ puuid: string; placement?: number; level?: number }> } }

/**
 * Build a TFT summary for one saved account. Never throws. Detects the LoL-only
 * key case (403 on tft/*) and reports `needsAccess` so the hub can explain it.
 */
export async function buildTftSummary(account: TftAccount): Promise<TftSummary> {
  const base: TftSummary = { account, ranks: [], recent: [], avgPlacement: null, top4Rate: null, firsts: 0 };
  if (!hasTftKey()) return { ...base, needsKey: true, error: "No Riot TFT API key configured." };

  const platform = (account.region || "euw1").toLowerCase();
  const regional = toRegional(platform);

  // 1) puuid — resolve via Account-v1 with the TFT key (product-agnostic).
  let puuid = account.puuid;
  if (!puuid) {
    const acc = await resolveTftAccount(account.gameName, account.tagLine, platform);
    if (!acc.ok || !acc.data) {
      if (acc.status === 403) return { ...base, needsAccess: true, error: "This Riot key can't access this data (403)." };
      return { ...base, error: `Couldn't resolve ${account.gameName}#${account.tagLine} (Riot ${acc.status}).` };
    }
    puuid = acc.data.puuid;
  }

  // 2) TFT league (rank) + recent match ids — these 403 on a LoL-only key.
  const [league, ids] = await Promise.all([
    tftFetch<RawTftLeagueEntry[]>(`https://${platform}.api.riotgames.com/tft/league/v1/by-puuid/${encodeURIComponent(puuid)}`, 60),
    tftFetch<string[]>(`https://${regional}.api.riotgames.com/tft/match/v1/matches/by-puuid/${encodeURIComponent(puuid)}/ids?count=10`, 60),
  ]);

  if (league.status === 403 || ids.status === 403) {
    return { ...base, account: { ...account, puuid }, needsAccess: true, error: "This Riot key doesn't have TFT product access (403)." };
  }

  const ranks: TftRank[] = (league.data ?? []).map((e) => ({
    queueType: e.queueType ?? "RANKED_TFT",
    tier: e.tier ?? "",
    rank: e.rank ?? "",
    lp: e.leaguePoints ?? 0,
    wins: e.wins ?? 0,
    losses: e.losses ?? 0,
  }));

  // 3) recent placements — fetch each match, read this puuid's placement.
  const matchIds = (ids.data ?? []).slice(0, 10);
  const matches = await Promise.all(
    matchIds.map((id) => tftFetch<RawTftMatch>(`https://${regional}.api.riotgames.com/tft/match/v1/matches/${encodeURIComponent(id)}`, 60 * 60 * 24)),
  );
  const recent: TftMatchResult[] = [];
  for (const m of matches) {
    if (!m.ok || !m.data?.info) continue;
    const me = m.data.info.participants?.find((p) => p.puuid === puuid);
    if (!me?.placement) continue;
    recent.push({
      matchId: m.data.metadata?.match_id ?? "",
      placement: me.placement,
      level: me.level ?? 0,
      queueId: m.data.info.queue_id ?? 0,
      gameDatetimeMs: m.data.info.game_datetime ?? 0,
    });
  }
  recent.sort((a, b) => b.gameDatetimeMs - a.gameDatetimeMs);

  const placements = recent.map((r) => r.placement);
  const avgPlacement = placements.length ? placements.reduce((s, p) => s + p, 0) / placements.length : null;
  const top4Rate = placements.length ? placements.filter((p) => p <= 4).length / placements.length : null;
  const firsts = placements.filter((p) => p === 1).length;

  return { ...base, account: { ...account, puuid }, ranks, recent, avgPlacement, top4Rate, firsts };
}
