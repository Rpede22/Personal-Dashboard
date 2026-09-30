/**
 * Single source of truth for the current WoW raid tier. De-hardcodes the
 * constants that used to be duplicated across `app/api/wow/sync/route.ts`,
 * `app/api/wow/character/route.ts`, and `prisma/seed.ts`.
 *
 * When a new raid releases, edit `wow-tier.json` (repo root) — nothing else.
 * The JSON is shareable game data (not personal), so it stays tracked in git.
 * Consumers import from here; the seed script imports the JSON directly (its
 * runner doesn't share the `@/` path alias).
 *
 * `raidTier` — Raider.IO slug (e.g. "liberation-of-undermine", "tier-mn-1").
 * `instances` — Blizzard API instance names (en_US) for the tier's raids,
 *   used to filter/sort the encounters response for consistent boss indexing.
 * `bossCount` — total bosses in the tier (all difficulties share encounters).
 */

import tier from "@/wow-tier.json";

export const CURRENT_RAID_TIER: string = tier.raidTier;
export const CURRENT_TIER_LABEL: string = tier.label;
export const CURRENT_TIER_INSTANCES: string[] = tier.instances;
export const CURRENT_TIER_BOSS_COUNT: number = tier.bossCount;
