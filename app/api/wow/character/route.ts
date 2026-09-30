import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CURRENT_TIER_INSTANCES } from "@/lib/wow-tier";

/** Highest difficulty with ≥1 kill → "7/9H" / "2/9M" / "0/9" (never a stray
 *  mythic string when there are no mythic kills). */
function bestRaidSummary(raid: { total_bosses?: number; mythic_bosses_killed?: number; heroic_bosses_killed?: number; normal_bosses_killed?: number }): string {
  const total = raid.total_bosses ?? 0;
  const m = raid.mythic_bosses_killed ?? 0;
  const h = raid.heroic_bosses_killed ?? 0;
  const n = raid.normal_bosses_killed ?? 0;
  if (m > 0) return `${m}/${total}M`;
  if (h > 0) return `${h}/${total}H`;
  if (n > 0) return `${n}/${total}N`;
  return `0/${total}`;
}

const raidSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// In-memory cache for API lookups
const lookupCache = new Map<string, { data: unknown; ts: number }>();
const TTL = 60 * 60 * 1000; // 1 hour

// ── Blizzard API — decimal ilvl via equipment endpoint ────────────────────────
// Blizzard's `item_level_equipped` on the character endpoint is an integer (floored).
// The equipment endpoint gives each slot's true ilvl; averaging those gives the real decimal.
// Falls back to RIO integer when credentials are not set.
let _charBlizzardToken: { token: string; expiresAt: number } | null = null;

async function getCharBlizzardToken(region: string): Promise<string | null> {
  const clientId = process.env.BLIZZARD_CLIENT_ID;
  const clientSecret = process.env.BLIZZARD_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (_charBlizzardToken && Date.now() < _charBlizzardToken.expiresAt) return _charBlizzardToken.token;

  try {
    const res = await fetch(`https://${region}.battle.net/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) return null;
    const data = await res.json();
    _charBlizzardToken = {
      token: data.access_token,
      expiresAt: Date.now() + Math.max(0, data.expires_in - 300) * 1000,
    };
    return _charBlizzardToken.token;
  } catch { return null; }
}

/** Tier ("class") set collected count, e.g. { collected: 4, total: 5, name }. */
interface TierSet { collected: number; total: number; name: string | null }

// The 5 slots a WoW tier/class set occupies. The equipped set that covers the
// most of these is the tier set (works generically — no hardcoded tier IDs).
const TIER_SLOTS = new Set(["HEAD", "SHOULDER", "CHEST", "HANDS", "LEGS"]);

interface EquipmentData { ilvl: number | null; tierSet: TierSet | null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTierSet(items: any[]): TierSet | null {
  // Count how many tier slots each set id covers; the winner is the tier set.
  const bySet = new Map<number, { name: string | null; slots: number; equipped: number; total: number }>();
  for (const item of items) {
    const slot = item.slot?.type;
    const setInfo = item.set?.item_set;
    if (!setInfo?.id || !slot || !TIER_SLOTS.has(slot)) continue;
    if (!bySet.has(setInfo.id)) {
      const equipped = (item.set.items ?? []).filter((x: { is_equipped?: boolean }) => x.is_equipped).length;
      const total = (item.set.items ?? []).length || 5;
      bySet.set(setInfo.id, { name: setInfo.name ?? null, slots: 0, equipped, total });
    }
    bySet.get(setInfo.id)!.slots++;
  }
  if (bySet.size === 0) return null;
  const best = [...bySet.values()].sort((a, b) => b.slots - a.slots || b.equipped - a.equipped)[0];
  return { collected: best.equipped, total: best.total, name: best.name };
}

async function fetchEquipment(name: string, realm: string, region: string): Promise<EquipmentData> {
  const r = region.toLowerCase();
  const token = await getCharBlizzardToken(r);
  if (!token) return { ilvl: null, tierSet: null };

  const realmSlug = realm.toLowerCase().replace(/'/g, "").replace(/\s+/g, "-");
  const charName = name.toLowerCase();

  try {
    const res = await fetch(
      `https://${r}.api.blizzard.com/profile/wow/character/${encodeURIComponent(realmSlug)}/${encodeURIComponent(charName)}/equipment?namespace=profile-${r}&locale=en_US`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return { ilvl: null, tierSet: null };
    const data = await res.json();

    const allItems = data.equipped_items ?? [];
    const tierSet = extractTierSet(allItems);

    // WoW ilvl formula: 16-slot average, excluding Shirt and Tabard.
    // If a 2H weapon is equipped (no Off Hand), Main Hand counts twice.
    const EXCLUDED_SLOTS = new Set(["SHIRT", "TABARD"]);
    const items: Array<{ slot?: { type?: string }; level?: { value?: number } }> =
      allItems.filter(
        (item: { slot?: { type?: string } }) => !EXCLUDED_SLOTS.has(item.slot?.type ?? "")
      );
    if (items.length === 0) return { ilvl: null, tierSet };

    const total = items.reduce((sum, item) => sum + (item.level?.value ?? 0), 0);
    const hasOffHand = items.some(item => item.slot?.type === "OFF_HAND");
    const mainHand = items.find(item => item.slot?.type === "MAIN_HAND");

    // If using a 2H weapon, add main hand ilvl a second time to fill the missing off-hand slot
    const adjustedTotal = (!hasOffHand && mainHand) ? total + (mainHand.level?.value ?? 0) : total;
    return { ilvl: adjustedTotal / 16, tierSet };
  } catch { return { ilvl: null, tierSet: null }; }
}

/** Most recent weekly reset (Wednesday 06:00 UTC — EU). */
function currentWeekStartMs(now = Date.now()): number {
  const d = new Date(now);
  const reset = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 6, 0, 0, 0));
  const daysSinceWed = (d.getUTCDay() - 3 + 7) % 7; // Wed = 3
  reset.setUTCDate(reset.getUTCDate() - daysSinceWed);
  if (now < reset.getTime()) reset.setUTCDate(reset.getUTCDate() - 7); // before this week's reset
  return reset.getTime();
}

/**
 * #68 Great Vault (raid) — count distinct bosses killed this reset in the
 * current raid. Uses the Blizzard encounters endpoint's `last_kill_timestamp`
 * (same signal the sync route uses). The "current raid" is the latest instance
 * of the latest expansion, so it's robust to a stale `wow-tier.json`.
 * Returns null when unavailable (no token / no data).
 */
async function fetchRaidVault(name: string, realm: string, region: string): Promise<number | null> {
  const r = region.toLowerCase();
  const token = await getCharBlizzardToken(r);
  if (!token) return null;
  const realmSlug = realm.toLowerCase().replace(/'/g, "").replace(/\s+/g, "-");
  try {
    const res = await fetch(
      `https://${r}.api.blizzard.com/profile/wow/character/${encodeURIComponent(realmSlug)}/${encodeURIComponent(name.toLowerCase())}/encounters/raids?namespace=profile-${r}&locale=en_US`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const expansions = data.expansions ?? [];
    const lastExp = expansions[expansions.length - 1];
    const instances = lastExp?.instances ?? [];
    const currentRaid = instances[instances.length - 1];
    if (!currentRaid) return null;
    const weekStart = currentWeekStartMs();
    const killed = new Set<string>();
    for (const mode of currentRaid.modes ?? []) {
      for (const enc of mode.progress?.encounters ?? []) {
        if ((enc.last_kill_timestamp ?? 0) >= weekStart) {
          killed.add(String(enc.encounter?.id ?? enc.encounter?.name));
        }
      }
    }
    return killed.size;
  } catch {
    return null;
  }
}

async function lookupCharacter(name: string, realm: string, region: string) {
  const cacheKey = `${region}-${realm}-${name}`.toLowerCase();
  const cached = lookupCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL) return cached.data;

  const regionLower = region.toLowerCase();

  // Primary: Blizzard equipment endpoint for true decimal ilvl + tier-set count
  // (RIO `item_level_equipped` is floored to integer; Blizzard slot average gives real decimal)
  const equipment = await fetchEquipment(name, realm, region).catch(() => ({ ilvl: null, tierSet: null }));
  let ilvl: number | null = equipment.ilvl;
  const tierSet = equipment.tierSet;
  const weeklyRaidKills = await fetchRaidVault(name, realm, region).catch(() => null); // #68 raid vault

  // Raider.IO — score, raid progression, integer ilvl fallback, and this week's M+ runs
  const rioRes = await fetch(
    `https://raider.io/api/v1/characters/profile?region=${regionLower}&realm=${encodeURIComponent(realm)}&name=${encodeURIComponent(name)}&fields=mythic_plus_scores_by_season:current,raid_progression,gear,mythic_plus_weekly_highest_level_runs`,
    { next: { revalidate: 3600 } }
  );

  let rioScore: number | null = null;
  let rioError: string | null = null;
  let raidProgress: string | null = null;
  let weeklyHighestKey: number | null = null;
  let mplusVault: (number | null)[] | null = null; // 3 Great Vault M+ slots (reward key level, null = locked)

  if (rioRes.ok) {
    const rioData = await rioRes.json();
    rioScore =
      rioData.mythic_plus_scores_by_season?.[0]?.scores?.all ?? null;

    // Parse raid progression. RIO keys raid_progression by raid slug (e.g.
    // "venomous-abyss"), NOT by our internal tier key, so the old
    // `CURRENT_RAID_TIER in raidProg` never matched and fell back to an
    // arbitrary first key (hence the stray "1/1M"). Match the current tier's
    // instance names by slug; among matches pick the biggest raid (the main
    // one); fall back to the raid with the most bosses. Then show the **best
    // difficulty you actually have kills in** — 0 mythic + 7/9 heroic → "7/9H".
    const raidProg = rioData.raid_progression;
    if (raidProg && typeof raidProg === "object") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entries = Object.entries(raidProg) as [string, any][];
      const wantSlugs = CURRENT_TIER_INSTANCES.map(raidSlug);
      const matches = entries.filter(([k]) => wantSlugs.some((s) => k.includes(s) || s.includes(k)));
      const pool = matches.length > 0 ? matches : entries;
      const picked = pool.map((e) => e[1]).sort((a, b) => (b.total_bosses ?? 0) - (a.total_bosses ?? 0))[0];
      if (picked) raidProgress = bestRaidSummary(picked);
    }

    // Great Vault (M+) + highest key this week — from this week's runs, highest first.
    // Vault slots unlock at the 1st / 4th / 8th highest run; each slot's reward is that run's level.
    const weekly: Array<{ mythic_level?: number }> = Array.isArray(rioData.mythic_plus_weekly_highest_level_runs)
      ? [...rioData.mythic_plus_weekly_highest_level_runs].sort((a, b) => (b.mythic_level ?? 0) - (a.mythic_level ?? 0))
      : [];
    if (weekly.length > 0) {
      weeklyHighestKey = weekly[0].mythic_level ?? null;
      mplusVault = [1, 4, 8].map((n) => (weekly.length >= n ? weekly[n - 1].mythic_level ?? null : null));
    } else {
      mplusVault = [null, null, null];
    }

    // Fallback: get ilvl from Raider.IO if Blizzard didn't provide it
    if (ilvl === null && rioData.gear?.item_level_equipped) {
      ilvl = rioData.gear.item_level_equipped;
    }
  } else {
    rioError = `Raider.IO ${rioRes.status}`;
  }

  const result = {
    name,
    realm,
    region,
    ilvl,
    rioScore,
    raidProgress,
    tierSet,          // #70 { collected, total, name }
    weeklyHighestKey, // #69 highest M+ key completed this reset
    mplusVault,       // #68 Great Vault M+ slots (3 reward levels or nulls)
    weeklyRaidKills,  // #68 Great Vault raid — bosses killed this reset (current raid)
    errors: [rioError].filter(Boolean),
  };

  lookupCache.set(cacheKey, { data: result, ts: Date.now() });
  return result;
}

// GET /api/wow/character?name=X&realm=Y&region=eu&bust=1  (bust=1 clears cache for this char)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");
  const realm = searchParams.get("realm");
  const region = searchParams.get("region") ?? "eu";
  const bust = searchParams.get("bust") === "1";

  if (!name || !realm) {
    // Return list of saved characters, ordered by sortOrder
    const characters = await prisma.wowCharacter.findMany({
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json({ characters });
  }

  if (bust) {
    const cacheKey = `${region}-${realm}-${name}`.toLowerCase();
    lookupCache.delete(cacheKey);
  }

  const data = await lookupCharacter(name, realm, region);
  return NextResponse.json(data);
}

// POST /api/wow/character — save a character
export async function POST(request: Request) {
  const body = await request.json();
  const { name, realm, region } = body;

  if (!name || !realm) {
    return NextResponse.json({ error: "name and realm required" }, { status: 400 });
  }

  // Assign sortOrder = max existing + 1 so new chars appear at the bottom
  const maxChar = await prisma.wowCharacter.findFirst({ orderBy: { sortOrder: "desc" } });
  const newSortOrder = (maxChar?.sortOrder ?? -1) + 1;

  const character = await prisma.wowCharacter.upsert({
    where: {
      name_realm_region: {
        name: name.toLowerCase(),
        realm: realm.toLowerCase(),
        region: (region ?? "eu").toLowerCase(),
      },
    },
    update: {},
    create: {
      name: name.toLowerCase(),
      realm: realm.toLowerCase(),
      region: (region ?? "eu").toLowerCase(),
      sortOrder: newSortOrder,
    },
  });

  return NextResponse.json({ character }, { status: 201 });
}

// PATCH /api/wow/character — update sortOrder or notes
// Body: { id: number, sortOrder?: number, notes?: string }
export async function PATCH(request: Request) {
  const body = await request.json();
  const { id, sortOrder, notes } = body;

  if (id === undefined) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {};
  if (sortOrder !== undefined) data.sortOrder = parseInt(sortOrder);
  if (notes    !== undefined) data.notes     = notes;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const character = await prisma.wowCharacter.update({
    where: { id: parseInt(id) },
    data,
  });

  return NextResponse.json({ character });
}

// DELETE /api/wow/character?id=X
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.wowCharacter.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ ok: true });
}
