/**
 * Riot Games API helpers.
 *
 * Riot splits endpoints into two host families:
 *   • Regional routing (`europe`, `americas`, `asia`, `sea`) — Account-v1 + Match-v5
 *   • Platform routing (`euw1`, `na1`, `kr`, …)              — Summoner-v4, League-v4, Spectator-v5, Mastery-v4
 *
 * Free dev keys are rotating 24-hour tokens with tight limits:
 *   20 req / 1 s and 100 req / 2 min per app.
 * Cache aggressively — matches are immutable once finished; ranks + mastery move slowly.
 *
 * All fetches attach `X-Riot-Token`. Bearer-style Authorization does NOT work.
 */

const PLATFORM_TO_REGIONAL: Record<string, "europe" | "americas" | "asia" | "sea"> = {
  // Europe
  euw1: "europe", eun1: "europe", tr1: "europe", ru: "europe",
  // Americas
  na1:  "americas", br1: "americas", la1: "americas", la2: "americas",
  // Asia
  kr:   "asia", jp1: "asia",
  // SEA (Oceania + Southeast Asia)
  oc1:  "sea", ph2: "sea", sg2: "sea", th2: "sea", tw2: "sea", vn2: "sea",
};

export type PlatformRegion = keyof typeof PLATFORM_TO_REGIONAL;
export type RegionalRouting = "europe" | "americas" | "asia" | "sea";

/** Return the regional routing host for a given platform. Defaults to europe. */
export function toRegional(platform: string): RegionalRouting {
  return PLATFORM_TO_REGIONAL[platform.toLowerCase()] ?? "europe";
}

export function hasRiotKey(): boolean {
  return !!process.env.RIOT_API_KEY;
}

// ── HTTP wrapper ──────────────────────────────────────────────────────────────

interface RiotFetchOptions {
  /** Next.js fetch revalidate seconds. Defaults tuned per endpoint by caller. */
  revalidate?: number;
}

async function riotFetch<T>(url: string, opts: RiotFetchOptions = {}): Promise<
  { ok: true; data: T } | { ok: false; status: number; body: string }
> {
  const key = process.env.RIOT_API_KEY;
  if (!key) return { ok: false, status: 500, body: "RIOT_API_KEY not set" };
  try {
    const res = await fetch(url, {
      headers: { "X-Riot-Token": key },
      next: { revalidate: opts.revalidate ?? 300 },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, body: body.slice(0, 200) };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    return { ok: false, status: 0, body: String(err) };
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RiotAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export interface RiotSummoner {
  // Riot removed `id` and `accountId` from Summoner-v4 by-puuid responses in
  // late 2025 — only these four fields are returned now. Use puuid for
  // downstream calls (League-v4, Spectator-v5, Mastery-v4).
  puuid: string;
  profileIconId: number;
  summonerLevel: number;
  revisionDate: number;
}

export interface RiotLeagueEntry {
  queueType: string;        // "RANKED_SOLO_5x5" | "RANKED_FLEX_SR"
  tier: string;             // "IRON" | "BRONZE" | … | "CHALLENGER"
  rank: string;             // "IV" | "III" | "II" | "I"
  leaguePoints: number;
  wins: number;
  losses: number;
  hotStreak: boolean;
  veteran: boolean;
  freshBlood: boolean;
  inactive: boolean;
}

export interface RiotMatchParticipant {
  puuid: string;
  championName: string;
  championId: number;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  goldEarned: number;
  totalDamageDealtToChampions: number;
  win: boolean;
  teamPosition: string;    // "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY"
  visionScore: number;
  teamId: number;          // 100 = blue side, 200 = red side
  summoner1Id: number;     // summoner spell 1 (D)
  summoner2Id: number;     // summoner spell 2 (F)
  gameEndedInEarlySurrender: boolean; // true = remake (all players agree, ~3:30 mark)
  perks?: {
    styles: Array<{
      style: number;                                  // tree id (e.g. 8000 = Precision)
      selections: Array<{ perk: number }>;            // first item of primary tree is the keystone
      description: string;                            // "primaryStyle" | "subStyle"
    }>;
  };
}

export interface RiotMatchInfo {
  gameCreation: number;
  gameDuration: number;    // seconds
  gameEndTimestamp?: number;
  gameMode: string;
  gameType: string;
  queueId: number;
  participants: RiotMatchParticipant[];
}

export interface RiotMatch {
  metadata: { matchId: string; participants: string[] };
  info: RiotMatchInfo;
}

export interface RiotChampionMastery {
  championId: number;
  championLevel: number;
  championPoints: number;
  lastPlayTime: number;
  chestGranted: boolean;
  tokensEarned: number;
}

export interface RiotSpectatorGame {
  gameId: number;
  gameMode: string;
  gameQueueConfigId: number;
  gameStartTime: number;
  gameLength: number;
  participants: Array<{
    puuid: string;
    championId: number;
    teamId: number;
    riotId?: string;
    summonerName?: string;
  }>;
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

/** Resolve Riot ID → account (has puuid). Regional endpoint. */
export function fetchAccountByRiotId(gameName: string, tagLine: string, platform: string) {
  const regional = toRegional(platform);
  const url = `https://${regional}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  return riotFetch<RiotAccount>(url, { revalidate: 60 * 60 * 24 }); // Riot IDs rarely change; cache 24h
}

/** Summoner details by puuid. Platform endpoint. */
export function fetchSummonerByPuuid(puuid: string, platform: string) {
  const url = `https://${platform.toLowerCase()}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`;
  return riotFetch<RiotSummoner>(url, { revalidate: 60 * 10 }); // 10m — profile icon + level rarely change
}

/** Solo/duo + flex ranked entries. Platform endpoint, keyed by puuid (Riot's
 *  by-summoner variant is deprecated — Summoner-v4 no longer returns the
 *  encrypted summonerId, so we must use the newer by-puuid path). */
export function fetchRanksByPuuid(puuid: string, platform: string) {
  const url = `https://${platform.toLowerCase()}.api.riotgames.com/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`;
  return riotFetch<RiotLeagueEntry[]>(url, { revalidate: 60 }); // 60s — LP moves after every ranked game
}

/** Last N match IDs. Regional endpoint. */
export function fetchMatchIds(puuid: string, platform: string, count = 10, start = 0, queue?: number) {
  const regional = toRegional(platform);
  const q = queue !== undefined ? `&queue=${queue}` : "";
  const url = `https://${regional}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?start=${start}&count=${count}${q}`;
  return riotFetch<string[]>(url, { revalidate: 60 }); // 60s — new game IDs need to appear quickly
}

/** Full match detail. Regional endpoint. Match documents are immutable — cache 24h. */
export function fetchMatch(matchId: string, platform: string) {
  const regional = toRegional(platform);
  const url = `https://${regional}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`;
  return riotFetch<RiotMatch>(url, { revalidate: 60 * 60 * 24 });
}

/** Per-minute frames for a completed match (gold, xp, level, cs by participant).
 *  Riot returns participantId (1..10), not puuid — the caller must map via the
 *  parent match document's `metadata.participants` array. Immutable — cache 24h. */
export interface RiotMatchTimeline {
  info: {
    frameInterval: number;
    frames: Array<{
      timestamp: number;
      participantFrames: Record<string, {
        participantId: number;
        totalGold: number;
        currentGold: number;
        xp: number;
        level: number;
        minionsKilled: number;
        jungleMinionsKilled: number;
      }>;
    }>;
    participants: Array<{ participantId: number; puuid: string }>;
  };
}
export function fetchMatchTimeline(matchId: string, platform: string) {
  const regional = toRegional(platform);
  const url = `https://${regional}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}/timeline`;
  return riotFetch<RiotMatchTimeline>(url, { revalidate: 60 * 60 * 24 });
}

/** Top N champion masteries by points. Platform endpoint. */
export function fetchTopMasteries(puuid: string, platform: string, count = 5) {
  const url = `https://${platform.toLowerCase()}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeURIComponent(puuid)}/top?count=${count}`;
  return riotFetch<RiotChampionMastery[]>(url, { revalidate: 60 * 30 });
}

/** Is the summoner currently in an active game? 404 = not in game. */
export function fetchActiveGame(puuid: string, platform: string) {
  const url = `https://${platform.toLowerCase()}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${encodeURIComponent(puuid)}`;
  return riotFetch<RiotSpectatorGame>(url, { revalidate: 30 }); // 30s while playing
}

// ── Data Dragon (champion metadata, no key required) ─────────────────────────

let dragonVersion: string | null = null;
let dragonVersionExpiry = 0;

export async function getDragonVersion(): Promise<string> {
  if (dragonVersion && Date.now() < dragonVersionExpiry) return dragonVersion;
  try {
    const res = await fetch("https://ddragon.leagueoflegends.com/api/versions.json", { next: { revalidate: 60 * 60 * 24 } });
    const versions: string[] = await res.json();
    dragonVersion = versions[0] ?? "15.1.1";
  } catch {
    dragonVersion = "15.1.1"; // reasonable fallback
  }
  dragonVersionExpiry = Date.now() + 24 * 60 * 60 * 1000;
  return dragonVersion;
}

let championsById: Record<number, string> | null = null;

/** Return { championId → champion key }. Champion key is the identifier used in
 *  Data Dragon URLs (e.g. `Ahri`, not `Ahri.png`). Cached for the process lifetime. */
export async function getChampionsById(): Promise<Record<number, string>> {
  if (championsById) return championsById;
  try {
    const version = await getDragonVersion();
    const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`, { next: { revalidate: 60 * 60 * 24 } });
    const data: { data: Record<string, { key: string; id: string }> } = await res.json();
    const out: Record<number, string> = {};
    for (const champ of Object.values(data.data)) {
      out[parseInt(champ.key)] = champ.id;
    }
    championsById = out;
  } catch {
    championsById = {};
  }
  return championsById;
}

// ── Runes (Community Dragon) ──────────────────────────────────────────────────
// Riot's Match-v5 reports perks as opaque numeric IDs. To render icons we need
// two lookup tables:
//   • perk id → keystone icon URL   (from perks.json)
//   • tree id → tree icon URL       (from perkstyles.json)
// Both files are large but static; fetched once and memoised for the process.

const CDRAGON_PREFIX = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default";

/** Turn an iconPath like "/lol-game-data/assets/v1/perk-images/Styles/Precision/Conqueror/Conqueror.png"
 *  into the Community Dragon URL, which is lowercase and rooted under `assets`. */
function cdragonAssetUrl(iconPath: string): string {
  return `${CDRAGON_PREFIX}${iconPath.toLowerCase().replace("/lol-game-data/assets/", "/")}`;
}

let perkIconById: Record<number, string> | null = null;
export async function getPerkIconsById(): Promise<Record<number, string>> {
  if (perkIconById) return perkIconById;
  try {
    const res = await fetch(`${CDRAGON_PREFIX}/v1/perks.json`, { next: { revalidate: 60 * 60 * 24 } });
    const data: Array<{ id: number; iconPath: string }> = await res.json();
    const out: Record<number, string> = {};
    for (const p of data) if (p.iconPath) out[p.id] = cdragonAssetUrl(p.iconPath);
    perkIconById = out;
  } catch {
    perkIconById = {};
  }
  return perkIconById;
}

let perkStyleIconById: Record<number, string> | null = null;
export async function getPerkStyleIconsById(): Promise<Record<number, string>> {
  if (perkStyleIconById) return perkStyleIconById;
  try {
    const res = await fetch(`${CDRAGON_PREFIX}/v1/perkstyles.json`, { next: { revalidate: 60 * 60 * 24 } });
    const data: { styles: Array<{ id: number; iconPath: string }> } = await res.json();
    const out: Record<number, string> = {};
    for (const s of data.styles ?? []) if (s.iconPath) out[s.id] = cdragonAssetUrl(s.iconPath);
    perkStyleIconById = out;
  } catch {
    perkStyleIconById = {};
  }
  return perkStyleIconById;
}

// ── Public URL builders (safe to import client-side; no fetches) ────────────
// Centralises the Data Dragon / Community Dragon URL templates so widgets and
// hubs don't drift out of sync.

export function ddragonChampionIcon(version: string, championName: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championName}.png`;
}

export function ddragonProfileIcon(version: string, profileIconId: number): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${profileIconId}.png`;
}

export function ddragonSummonerSpellIcon(version: string, spellName: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${spellName}.png`;
}

export function cdragonRankedEmblem(tier: string): string {
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${tier.toLowerCase()}.png`;
}

export function cdragonPositionIcon(position: string): string {
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-${position.toLowerCase()}.svg`;
}

let summonerSpellsById: Record<number, string> | null = null;

/** Return { summonerSpellKey → asset name }. Match participants report
 *  `summoner1Id` / `summoner2Id` as numeric keys (e.g. 4 = Flash). Data
 *  Dragon summoner.json has each spell keyed by its string name (e.g.
 *  `SummonerFlash`) with a `key: "4"` field — invert to id → name. */
export async function getSummonerSpellsById(): Promise<Record<number, string>> {
  if (summonerSpellsById) return summonerSpellsById;
  try {
    const version = await getDragonVersion();
    const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/summoner.json`, { next: { revalidate: 60 * 60 * 24 } });
    const data: { data: Record<string, { key: string; id: string }> } = await res.json();
    const out: Record<number, string> = {};
    for (const spell of Object.values(data.data)) {
      out[parseInt(spell.key)] = spell.id;
    }
    summonerSpellsById = out;
  } catch {
    summonerSpellsById = {};
  }
  return summonerSpellsById;
}
