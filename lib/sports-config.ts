export const SPORTS_DB_BASE = "https://www.thesportsdb.com/api/v1/json/3";

export interface TeamConfig {
  id: string;           // TheSportsDB team ID
  slug: string;
  name: string;
  shortName: string;
  matchKeyword: string; // keyword to find this team in event strings + standings
  leagueId: string;
  leagueName: string;
  sport: "football" | "icehockey";
  accentColor: string;
  emoji: string;
  season: string;
  // Whether league-level event endpoints work reliably (false = use team-level only)
  leagueEventsWork: boolean;
  // Show split-table divider after this rank (e.g. 6 for Esbjerg fB after round 22)
  splitAfterRank?: number;
  splitLabel?: string;
  // If true, auto-detect current league via lookupteam.php each hour
  leagueAutoDetect?: boolean;
  // API-Football (RapidAPI) IDs — used when RAPIDAPI_KEY is set.
  // Find IDs at: https://www.api-football.com/documentation-v3
  apiFootballTeamId?: number;
  apiFootballLeagueId?: number;
  apiFootballSeason?: number;   // Start year, e.g. 2025 for the 2025-2026 season
  // FotMob IDs — free, no key. Preferred for football (full standings + correct fixtures).
  // League IDs: Danish 1st Div = 85, La Liga = 87, Superliga = 46.
  // Team IDs: Barcelona = 8634, Esbjerg fB = 8285.
  fotmobLeagueId?: number;
  fotmobTeamId?: number;
}

// Possible leagues for teams that can be promoted/relegated.
// Key: TheSportsDB league name → league config to apply.
export interface LeagueAutoConfig {
  id: string;
  name: string;
  leagueEventsWork: boolean;
  splitAfterRank?: number;
  splitLabel?: string;
}

export const LEAGUE_MAPPINGS: Record<string, Record<string, LeagueAutoConfig>> = {
  // Esbjerg fB (team id 133939) — tracks Danish football divisions
  "133939": {
    "Danish 1st Division": {
      id: "4683",
      name: "Danish 1st Division",
      leagueEventsWork: false,
      splitAfterRank: 6,
      splitLabel: "── Relegation Play-off ──",
    },
    "Danish Superliga": {
      id: "4337",
      name: "Danish Superliga",
      leagueEventsWork: false,
    },
    "Danish 2nd Division": {
      id: "4684",
      name: "Danish 2nd Division",
      leagueEventsWork: false,
    },
  },
};

export const SPORTS_TEAMS: Record<string, TeamConfig> = {
  "esbjerg-fb": {
    id: "133939",
    slug: "esbjerg-fb",
    name: "Esbjerg fB",
    shortName: "EFB",
    matchKeyword: "Esbjerg",
    leagueId: "4683",
    leagueName: "Danish 1st Division",
    sport: "football",
    accentColor: "var(--accent-blue)",
    emoji: "⚽",
    season: "2025-2026",
    leagueEventsWork: false, // TheSportsDB league ID 4683 returns English League One events (data bug)
    splitAfterRank: 6,
    splitLabel: "── Relegation Play-off ──",
    leagueAutoDetect: true, // Auto-detect league via lookupteam.php (handles promotion/relegation)
    // API-Football IDs (verify at api-football.com — search "Esbjerg" under Denmark teams)
    apiFootballTeamId: 1366,      // ⚠ verify this ID
    apiFootballLeagueId: 120,     // Danish 1st Division on API-Football
    apiFootballSeason: 2025,
    // FotMob IDs (verified 2026-04)
    fotmobLeagueId: 85,           // 1. Division (Denmark)
    fotmobTeamId: 8285,           // Esbjerg fB
  },
  "barcelona": {
    id: "133739",
    slug: "barcelona",
    name: "FC Barcelona",
    shortName: "FCB",
    matchKeyword: "Barcelona",
    leagueId: "4335",
    leagueName: "Spanish La Liga",
    sport: "football",
    accentColor: "var(--accent-red)",
    emoji: "⚽",
    season: "2025-2026",
    leagueEventsWork: false, // Same issue — league event endpoint returns English teams
    // API-Football IDs (well-known, stable)
    apiFootballTeamId: 529,       // FC Barcelona
    apiFootballLeagueId: 140,     // La Liga
    apiFootballSeason: 2025,
    // FotMob IDs (verified 2026-04)
    fotmobLeagueId: 87,           // La Liga
    fotmobTeamId: 8634,           // FC Barcelona
  },
  "esbjerg-energy": {
    id: "140920",
    slug: "esbjerg-energy",
    name: "Esbjerg Energy",
    shortName: "EEN",
    matchKeyword: "Esbjerg",
    leagueId: "4930",
    leagueName: "Danish Metal Ligaen",
    sport: "icehockey",
    accentColor: "var(--accent-orange)",
    emoji: "🏒",
    season: "2025-2026",
    leagueEventsWork: true, // Metal Ligaen league events work correctly
  },
};
