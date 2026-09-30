/**
 * Steam wishlist + sale alerts — client-safe types + Steam client (no `fs`).
 *
 * Fully keyless: the wishlist (`IWishlistService/GetWishlist`) and per-app price
 * data (`store/appdetails`) both work with no API key — you only need the user's
 * public SteamID64 (17-digit) and a public wishlist. The headline feature is
 * "something on your wishlist is on sale".
 *
 * SteamID config file IO lives in the route (fs); this module stays client-safe.
 */

export interface WishlistItem {
  appid: number;
  name: string;
  header?: string;       // store header image
  isFree: boolean;
  discountPct: number;   // 0 = no discount
  priceFinal?: string;   // Steam-formatted (e.g. "60,00€" / "kr. 60,00")
  priceInitial?: string; // pre-discount, when on sale
  onSale: boolean;
}

export interface SteamWishlist {
  steamId: string;
  items: WishlistItem[];
  onSaleCount: number;
  error?: string;
  needsId?: boolean;
}

/** A SteamID64 is a 17-digit number starting 7656119…. */
export function isSteamId64(s: string): boolean {
  return /^7656\d{13}$/.test(s.trim());
}

/** Keyless CDN capsule image for a game (no API key needed). */
export function steamCapsule(appid: number): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/capsule_231x87.jpg`;
}

/** Steam store page for an app. */
export function steamStoreUrl(appid: number): string {
  return `https://store.steampowered.com/app/${appid}`;
}

const MAX_ITEMS = 50;

async function jsonFetch<T>(url: string, revalidate: number): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Wishlist appids (keyless), highest-priority first. */
export async function fetchWishlistAppids(steamId: string): Promise<number[] | null> {
  const data = await jsonFetch<{ response?: { items?: Array<{ appid: number; priority: number }> } }>(
    `https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid=${encodeURIComponent(steamId)}`,
    900,
  );
  const items = data?.response?.items;
  if (!Array.isArray(items)) return null;
  return items
    .slice()
    .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))
    .map((i) => i.appid);
}

interface AppDetails {
  success: boolean;
  data?: {
    name: string;
    is_free: boolean;
    header_image?: string;
    price_overview?: {
      discount_percent: number;
      final_formatted?: string;
      initial_formatted?: string;
    };
  };
}

/** One app's name + price (keyless). `cc` sets the store region/currency. */
async function fetchApp(appid: number, cc: string): Promise<WishlistItem | null> {
  const data = await jsonFetch<Record<string, AppDetails>>(
    `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=${encodeURIComponent(cc)}&filters=basic,price_overview`,
    1800,
  );
  const entry = data?.[String(appid)];
  if (!entry?.success || !entry.data) return null;
  const d = entry.data;
  const po = d.price_overview;
  const discountPct = po?.discount_percent ?? 0;
  return {
    appid,
    name: d.name,
    header: d.header_image,
    isFree: d.is_free,
    discountPct,
    priceFinal: po?.final_formatted,
    priceInitial: discountPct > 0 ? po?.initial_formatted : undefined,
    onSale: discountPct > 0,
  };
}

/** Resolve a wishlist to priced items, on-sale first. Never throws. */
export async function buildWishlist(steamId: string, cc: string): Promise<SteamWishlist> {
  const base: SteamWishlist = { steamId, items: [], onSaleCount: 0 };
  const appids = await fetchWishlistAppids(steamId);
  if (appids === null) {
    return { ...base, error: "Couldn't read that wishlist — check the SteamID64 is correct and the profile + wishlist are public." };
  }
  const slice = appids.slice(0, MAX_ITEMS);
  const results = await Promise.all(slice.map((id) => fetchApp(id, cc)));
  const items = results.filter((r): r is WishlistItem => !!r);
  // On-sale first (deepest discount first), then the rest keep wishlist order.
  items.sort((a, b) => (b.discountPct - a.discountPct));
  return { ...base, items, onSaleCount: items.filter((i) => i.onSale).length };
}

/* ─────────────────────────── keyed Steam Web API ───────────────────────────
 * Everything below needs a (free, bundled) Steam Web API key in STEAM_API_KEY
 * — get one at https://steamcommunity.com/dev/apikey. Server-only (reads the
 * env var), so the key never reaches the client bundle. Each helper returns
 * null on any failure so the hub degrades gracefully.
 * ------------------------------------------------------------------------- */

/** True when a Steam Web API key is configured. */
export function hasSteamKey(): boolean {
  return !!process.env.STEAM_API_KEY;
}

function steamKey(): string {
  return process.env.STEAM_API_KEY ?? "";
}

export interface SteamGame {
  appid: number;
  name: string;
  playtimeForeverMin: number;   // minutes, all-time
  playtimeRecentMin?: number;   // minutes, past 2 weeks (recently-played only)
}

export interface SteamPersona {
  personaName: string;
  avatar?: string;      // full avatar URL
  profileUrl?: string;
}

export interface GameAchievements {
  appid: number;
  name: string;
  achieved: number;
  total: number;
  pct: number;                  // 0..100
}

export interface SteamProfile {
  steamId: string;
  persona?: SteamPersona;
  recentlyPlayed: SteamGame[];  // past 2 weeks, most-recent first
  topPlayed: SteamGame[];       // all-time, most-played first (top N)
  gameCount: number;            // total games owned
  totalPlaytimeMin: number;     // minutes across the whole library
  // #6 extras
  unplayedCount: number;        // owned games with 0 playtime (the backlog)
  unplayed: SteamGame[];        // a sample of never-played titles
  achievements?: GameAchievements[]; // completion % for recently-played games
  needsKey?: boolean;
  needsId?: boolean;
  error?: string;
}

const TOP_PLAYED = 6;

/** Resolve a Steam vanity name (custom URL) to a SteamID64. Needs a key. */
export async function resolveVanityUrl(vanity: string): Promise<string | null> {
  if (!hasSteamKey()) return null;
  const data = await jsonFetch<{ response?: { success?: number; steamid?: string } }>(
    `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${steamKey()}&vanityurl=${encodeURIComponent(vanity)}`,
    900,
  );
  if (data?.response?.success === 1 && data.response.steamid) return data.response.steamid;
  return null;
}

/** Persona name + avatar for a SteamID64. Needs a key. */
async function fetchPersona(steamId: string): Promise<SteamPersona | undefined> {
  const data = await jsonFetch<{ response?: { players?: Array<{ personaname: string; avatarfull?: string; profileurl?: string }> } }>(
    `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${steamKey()}&steamids=${encodeURIComponent(steamId)}`,
    600,
  );
  const p = data?.response?.players?.[0];
  if (!p) return undefined;
  return { personaName: p.personaname, avatar: p.avatarfull, profileUrl: p.profileurl };
}

interface RawGame { appid: number; name?: string; playtime_forever?: number; playtime_2weeks?: number }

/** Recently-played games (past 2 weeks). Needs a key. */
async function fetchRecentlyPlayed(steamId: string): Promise<SteamGame[]> {
  const data = await jsonFetch<{ response?: { games?: RawGame[] } }>(
    `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=${steamKey()}&steamid=${encodeURIComponent(steamId)}`,
    600,
  );
  const games = data?.response?.games ?? [];
  return games.map((g) => ({
    appid: g.appid,
    name: g.name ?? `App ${g.appid}`,
    playtimeForeverMin: g.playtime_forever ?? 0,
    playtimeRecentMin: g.playtime_2weeks ?? 0,
  }));
}

/** Owned-games stats: count, total playtime, top-played, backlog. Needs a key + public profile. */
async function fetchOwnedGames(steamId: string): Promise<{ gameCount: number; total: number; top: SteamGame[]; unplayed: SteamGame[]; unplayedCount: number } | null> {
  const data = await jsonFetch<{ response?: { game_count?: number; games?: RawGame[] } }>(
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${steamKey()}&steamid=${encodeURIComponent(steamId)}&include_appinfo=1&include_played_free_games=1`,
    1800,
  );
  const resp = data?.response;
  if (!resp || !Array.isArray(resp.games)) return null;
  const games: SteamGame[] = resp.games.map((g) => ({
    appid: g.appid,
    name: g.name ?? `App ${g.appid}`,
    playtimeForeverMin: g.playtime_forever ?? 0,
  }));
  const total = games.reduce((sum, g) => sum + g.playtimeForeverMin, 0);
  const top = games.slice().sort((a, b) => b.playtimeForeverMin - a.playtimeForeverMin).slice(0, TOP_PLAYED);
  // Backlog = owned games never launched. Sample a handful (alphabetical) for display.
  const neverPlayed = games.filter((g) => g.playtimeForeverMin === 0).sort((a, b) => a.name.localeCompare(b.name));
  return { gameCount: resp.game_count ?? games.length, total, top, unplayed: neverPlayed.slice(0, 12), unplayedCount: neverPlayed.length };
}

/** Achievement completion for one owned game. Returns null when the game has no
 *  achievements or stats aren't public. Needs a key. */
async function fetchAchievements(steamId: string, appid: number): Promise<{ achieved: number; total: number } | null> {
  const data = await jsonFetch<{ playerstats?: { success?: boolean; achievements?: Array<{ achieved: number }> } }>(
    `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key=${steamKey()}&steamid=${encodeURIComponent(steamId)}&appid=${appid}`,
    3600,
  );
  const a = data?.playerstats?.achievements;
  if (!Array.isArray(a) || a.length === 0) return null;
  return { achieved: a.filter((x) => x.achieved === 1).length, total: a.length };
}

/** Build the keyed profile view (recently played + playtime stats). Never throws. */
export async function buildSteamProfile(steamId: string): Promise<SteamProfile> {
  const base: SteamProfile = { steamId, recentlyPlayed: [], topPlayed: [], gameCount: 0, totalPlaytimeMin: 0, unplayedCount: 0, unplayed: [] };
  if (!hasSteamKey()) {
    return { ...base, needsKey: true, error: "No Steam Web API key configured." };
  }
  const [persona, recent, owned] = await Promise.all([
    fetchPersona(steamId),
    fetchRecentlyPlayed(steamId),
    fetchOwnedGames(steamId),
  ]);
  if (!owned && recent.length === 0 && !persona) {
    return { ...base, error: "Couldn't read this profile — make sure the SteamID64 is correct and game details are public." };
  }
  // Achievement completion for the recently-played games (bounded fan-out —
  // one call per recent game, drop games with no achievements / private stats).
  const achievements = (
    await Promise.all(
      recent.slice(0, 6).map(async (g): Promise<GameAchievements | null> => {
        const r = await fetchAchievements(steamId, g.appid).catch(() => null);
        if (!r) return null;
        return { appid: g.appid, name: g.name, achieved: r.achieved, total: r.total, pct: r.total ? Math.round((r.achieved / r.total) * 100) : 0 };
      }),
    )
  ).filter((x): x is GameAchievements => x !== null);

  return {
    ...base,
    persona,
    recentlyPlayed: recent,
    topPlayed: owned?.top ?? [],
    gameCount: owned?.gameCount ?? 0,
    totalPlaytimeMin: owned?.total ?? 0,
    unplayedCount: owned?.unplayedCount ?? 0,
    unplayed: owned?.unplayed ?? [],
    achievements: achievements.length > 0 ? achievements : undefined,
    // Owned-games needs "game details" public even with a key; surface a soft hint.
    error: !owned ? "Playtime stats need your Steam game details set to public." : undefined,
  };
}

/** Minutes → a compact "12h" / "340h" / "45m" label. */
export function formatPlaytime(min: number): string {
  if (min < 60) return `${min}m`;
  const hours = Math.round(min / 60);
  return `${hours.toLocaleString()}h`;
}
