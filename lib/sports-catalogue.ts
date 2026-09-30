/**
 * Catalogue of leagues the team picker can choose from. The picker is a
 * two-step League → Team dropdown: pick a league here, then pick one of its
 * teams (teams are fetched LIVE from the league's current standings — see
 * `/api/sports/catalogue` — so there are no hardcoded team IDs to rot).
 *
 * Adding a new league = one entry here + a provider that can (a) list its
 * teams and (b) return standings/fixtures for a team. Football flows through
 * FotMob (free, no key); Danish ice hockey through Metal Ligaen; the US major
 * leagues (NBA / NFL / NHL) through ESPN's hidden API (also free, no key).
 *
 * Note: the Edmonton Oilers keep their own dedicated `/nhl` hub (Monte-Carlo
 * predictor + bracket). NHL here is for *following other* NHL teams generically
 * — the special EDM experience is unchanged.
 */

export type SportKind = "football" | "icehockey" | "basketball" | "americanfootball";
export type SportsProvider = "fotmob" | "metalligaen" | "espn";

export interface CatalogueLeague {
  /** Stable catalogue id, e.g. "premier-league". */
  id: string;
  label: string;
  country: string;
  sport: SportKind;
  provider: SportsProvider;
  /** FotMob league id (football only). */
  fotmobLeagueId?: number;
  /** ESPN path pair (US leagues only), e.g. { sport: "basketball", league: "nba" }. */
  espnSport?: string;
  espnLeague?: string;
  /** Default accent applied to a team added from this league. */
  accent: string;
  emoji: string;
  /** Split-table divider (e.g. Danish 1. Division post round 22). */
  splitAfterRank?: number;
  splitLabel?: string;
}

export const CATALOGUE_LEAGUES: CatalogueLeague[] = [
  // ── Football — top-5 European leagues (FotMob ids verified) ──────────────
  { id: "premier-league", label: "Premier League", country: "England", sport: "football", provider: "fotmob", fotmobLeagueId: 47, accent: "var(--accent-purple)", emoji: "⚽" },
  { id: "laliga",         label: "LaLiga",         country: "Spain",   sport: "football", provider: "fotmob", fotmobLeagueId: 87, accent: "var(--accent-red)",    emoji: "⚽" },
  { id: "serie-a",        label: "Serie A",        country: "Italy",   sport: "football", provider: "fotmob", fotmobLeagueId: 55, accent: "var(--accent-blue)",   emoji: "⚽" },
  { id: "bundesliga",     label: "Bundesliga",     country: "Germany", sport: "football", provider: "fotmob", fotmobLeagueId: 54, accent: "var(--accent-red)",    emoji: "⚽" },
  { id: "ligue-1",        label: "Ligue 1",        country: "France",  sport: "football", provider: "fotmob", fotmobLeagueId: 53, accent: "var(--accent-blue)",   emoji: "⚽" },
  // ── Football — Denmark (top two divisions) ───────────────────────────────
  { id: "superliga",   label: "Superligaen", country: "Denmark", sport: "football", provider: "fotmob", fotmobLeagueId: 46, accent: "var(--accent-green)", emoji: "⚽" },
  { id: "1-division",  label: "1. Division", country: "Denmark", sport: "football", provider: "fotmob", fotmobLeagueId: 85, accent: "var(--accent-blue)",  emoji: "⚽", splitAfterRank: 6, splitLabel: "── Relegation Play-off ──" },
  // ── Ice hockey — Denmark ─────────────────────────────────────────────────
  { id: "metal-ligaen", label: "Metal Ligaen", country: "Denmark", sport: "icehockey", provider: "metalligaen", accent: "var(--accent-orange)", emoji: "🏒" },
  // ── US major leagues (ESPN) ──────────────────────────────────────────────
  { id: "nba", label: "NBA", country: "USA", sport: "basketball",       provider: "espn", espnSport: "basketball", espnLeague: "nba", accent: "var(--accent-orange)", emoji: "🏀" },
  { id: "nfl", label: "NFL", country: "USA", sport: "americanfootball", provider: "espn", espnSport: "football",   espnLeague: "nfl", accent: "var(--accent-green)",  emoji: "🏈" },
  { id: "nhl", label: "NHL", country: "USA/Canada", sport: "icehockey", provider: "espn", espnSport: "hockey",     espnLeague: "nhl", accent: "var(--accent-blue)",   emoji: "🏒" },
];

export function getCatalogueLeague(id: string): CatalogueLeague | undefined {
  return CATALOGUE_LEAGUES.find((l) => l.id === id);
}
