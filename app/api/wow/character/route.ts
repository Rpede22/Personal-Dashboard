import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Must match the constant in app/api/wow/sync/route.ts — update both when a new raid releases.
const CURRENT_RAID_TIER = "tier-mn-1";

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

async function fetchDecimalIlvl(name: string, realm: string, region: string): Promise<number | null> {
  const r = region.toLowerCase();
  const token = await getCharBlizzardToken(r);
  if (!token) return null;

  const realmSlug = realm.toLowerCase().replace(/'/g, "").replace(/\s+/g, "-");
  const charName = name.toLowerCase();

  try {
    const res = await fetch(
      `https://${r}.api.blizzard.com/profile/wow/character/${encodeURIComponent(realmSlug)}/${encodeURIComponent(charName)}/equipment?namespace=profile-${r}&locale=en_US`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const items: Array<{ level?: { value?: number } }> = data.equipped_items ?? [];
    if (items.length === 0) return null;
    const total = items.reduce((sum, item) => sum + (item.level?.value ?? 0), 0);
    return total / items.length;
  } catch { return null; }
}

async function lookupCharacter(name: string, realm: string, region: string) {
  const cacheKey = `${region}-${realm}-${name}`.toLowerCase();
  const cached = lookupCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL) return cached.data;

  const regionLower = region.toLowerCase();

  // Primary: Blizzard equipment endpoint for true decimal ilvl
  // (RIO `item_level_equipped` is floored to integer; Blizzard slot average gives real decimal)
  let ilvl: number | null = await fetchDecimalIlvl(name, realm, region).catch(() => null);

  // Raider.IO — fetch RIO score, raid progression, and integer ilvl fallback
  const rioRes = await fetch(
    `https://raider.io/api/v1/characters/profile?region=${regionLower}&realm=${encodeURIComponent(realm)}&name=${encodeURIComponent(name)}&fields=mythic_plus_scores_by_season:current,raid_progression,gear`,
    { next: { revalidate: 3600 } }
  );

  let rioScore: number | null = null;
  let rioError: string | null = null;
  let raidProgress: string | null = null;

  if (rioRes.ok) {
    const rioData = await rioRes.json();
    rioScore =
      rioData.mythic_plus_scores_by_season?.[0]?.scores?.all ?? null;

    // Parse raid progression — prefer the current tier, fall back to first key
    const raidProg = rioData.raid_progression;
    if (raidProg && typeof raidProg === "object") {
      const tierKey = CURRENT_RAID_TIER in raidProg
        ? CURRENT_RAID_TIER
        : Object.keys(raidProg)[0];
      if (tierKey) {
        raidProgress = raidProg[tierKey]?.summary ?? null;
      }
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
    errors: [rioError].filter(Boolean),
  };

  lookupCache.set(cacheKey, { data: result, ts: Date.now() });
  return result;
}

// GET /api/wow/character?name=X&realm=Y&region=eu
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");
  const realm = searchParams.get("realm");
  const region = searchParams.get("region") ?? "eu";

  if (!name || !realm) {
    // Return list of saved characters, ordered by sortOrder
    const characters = await prisma.wowCharacter.findMany({
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json({ characters });
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

// PATCH /api/wow/character — update sortOrder for reordering
// Body: { id: number, sortOrder: number }
export async function PATCH(request: Request) {
  const body = await request.json();
  const { id, sortOrder } = body;

  if (id === undefined || sortOrder === undefined) {
    return NextResponse.json({ error: "id and sortOrder required" }, { status: 400 });
  }

  const character = await prisma.wowCharacter.update({
    where: { id: parseInt(id) },
    data: { sortOrder: parseInt(sortOrder) },
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
