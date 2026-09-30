/**
 * Server-only persisted list of followed sports teams. De-hardcodes what used
 * to be `SPORTS_TEAMS` in lib/sports-config.ts — the sports API, widget, and
 * hub now read this ordered list (max 6) instead of a fixed record. Seeded
 * from the original three teams so an unmigrated install is unchanged.
 *
 * Managed by `/api/sports/teams` + components/settings/TeamsSettings.tsx.
 * Persisted to `followed-teams.json` (gitignored — personal preference).
 * Uses `fs`; import only from server code.
 */

import fs from "fs";
import { configPath } from "./config-dir";
import type { SportKind, SportsProvider } from "./sports-catalogue";
import type { TeamConfig } from "./sports-config";

export interface FollowedTeam {
  /** Unique, URL-safe id — also the route slug (`/sports/<slug>`). */
  slug: string;
  name: string;
  shortName: string;
  sport: SportKind;
  provider: SportsProvider;
  /** Catalogue league id this team was picked from. */
  leagueId: string;
  leagueName: string;
  /** Substring used to find the team in standings/fixtures. */
  matchKeyword: string;
  accentColor: string;
  emoji: string;
  fotmobLeagueId?: number;
  fotmobTeamId?: number;
  // ESPN (US leagues: NBA / NFL / NHL)
  espnSport?: string;
  espnLeague?: string;
  espnTeamId?: string;
  splitAfterRank?: number;
  splitLabel?: string;
}

const FILE = "followed-teams.json";
export const MAX_FOLLOWED = 6;

/** The original hardcoded teams — used as the seed when no JSON exists. */
export function defaultFollowedTeams(): FollowedTeam[] {
  return [
    {
      slug: "esbjerg-fb", name: "Esbjerg fB", shortName: "EFB",
      sport: "football", provider: "fotmob",
      leagueId: "1-division", leagueName: "1. Division", matchKeyword: "Esbjerg",
      accentColor: "var(--accent-blue)", emoji: "⚽",
      fotmobLeagueId: 85, fotmobTeamId: 8285,
      splitAfterRank: 6, splitLabel: "── Relegation Play-off ──",
    },
    {
      slug: "barcelona", name: "FC Barcelona", shortName: "FCB",
      sport: "football", provider: "fotmob",
      leagueId: "laliga", leagueName: "LaLiga", matchKeyword: "Barcelona",
      accentColor: "var(--accent-red)", emoji: "⚽",
      fotmobLeagueId: 87, fotmobTeamId: 8634,
    },
    {
      slug: "esbjerg-energy", name: "Esbjerg Energy", shortName: "EEN",
      sport: "icehockey", provider: "metalligaen",
      leagueId: "metal-ligaen", leagueName: "Metal Ligaen", matchKeyword: "Esbjerg",
      accentColor: "var(--accent-orange)", emoji: "🏒",
    },
  ];
}

function coerce(raw: unknown): FollowedTeam | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const slug = str(r.slug).trim();
  const name = str(r.name).trim();
  if (!slug || !name) return null;
  const SPORTS: SportKind[] = ["football", "icehockey", "basketball", "americanfootball"];
  const sport: SportKind = SPORTS.includes(r.sport as SportKind) ? (r.sport as SportKind) : "football";
  const PROVIDERS: SportsProvider[] = ["fotmob", "metalligaen", "espn"];
  const provider: SportsProvider = PROVIDERS.includes(r.provider as SportsProvider) ? (r.provider as SportsProvider) : "fotmob";
  const defaultEmoji = sport === "basketball" ? "🏀" : sport === "americanfootball" ? "🏈" : sport === "icehockey" ? "🏒" : "⚽";
  return {
    slug, name,
    shortName: str(r.shortName).trim() || name.slice(0, 3).toUpperCase(),
    sport, provider,
    leagueId: str(r.leagueId).trim(),
    leagueName: str(r.leagueName).trim(),
    matchKeyword: str(r.matchKeyword).trim() || name,
    accentColor: str(r.accentColor).trim() || "var(--accent-blue)",
    emoji: str(r.emoji).trim() || defaultEmoji,
    fotmobLeagueId: num(r.fotmobLeagueId),
    fotmobTeamId: num(r.fotmobTeamId),
    espnSport: str(r.espnSport).trim() || undefined,
    espnLeague: str(r.espnLeague).trim() || undefined,
    espnTeamId: str(r.espnTeamId).trim() || undefined,
    splitAfterRank: num(r.splitAfterRank),
    splitLabel: str(r.splitLabel).trim() || undefined,
  };
}

export function readFollowedTeams(): FollowedTeam[] {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(FILE), "utf8"));
    const arr: unknown[] | null = Array.isArray(raw) ? raw : Array.isArray(raw?.teams) ? raw.teams : null;
    if (!arr) return defaultFollowedTeams();
    const cleaned = arr.map(coerce).filter((t): t is FollowedTeam => t !== null);
    return cleaned.length ? cleaned.slice(0, MAX_FOLLOWED) : defaultFollowedTeams();
  } catch {
    return defaultFollowedTeams();
  }
}

export function writeFollowedTeams(teams: FollowedTeam[]): void {
  fs.writeFileSync(configPath(FILE), JSON.stringify(teams.slice(0, MAX_FOLLOWED), null, 2), "utf8");
}

export function getFollowedTeam(slug: string): FollowedTeam | undefined {
  return readFollowedTeams().find((t) => t.slug === slug);
}

/** Adapt a FollowedTeam to the TeamConfig shape the sports route consumes,
 *  so the route logic (FotMob / Metal Ligaen branches) is unchanged. */
export function followedToTeamConfig(ft: FollowedTeam): TeamConfig {
  return {
    id: ft.slug,
    slug: ft.slug,
    name: ft.name,
    shortName: ft.shortName,
    matchKeyword: ft.matchKeyword,
    leagueId: ft.fotmobLeagueId ? String(ft.fotmobLeagueId) : "",
    leagueName: ft.leagueName,
    sport: ft.sport,
    accentColor: ft.accentColor,
    emoji: ft.emoji,
    season: "2025-2026",
    leagueEventsWork: false,
    splitAfterRank: ft.splitAfterRank,
    splitLabel: ft.splitLabel,
    fotmobLeagueId: ft.fotmobLeagueId,
    fotmobTeamId: ft.fotmobTeamId,
    espnSport: ft.espnSport,
    espnLeague: ft.espnLeague,
    espnTeamId: ft.espnTeamId,
  };
}
