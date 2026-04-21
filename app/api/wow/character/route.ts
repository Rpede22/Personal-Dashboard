import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// In-memory cache for API lookups
const lookupCache = new Map<string, { data: unknown; ts: number }>();
const TTL = 60 * 60 * 1000; // 1 hour

async function lookupCharacter(name: string, realm: string, region: string) {
  const cacheKey = `${region}-${realm}-${name}`.toLowerCase();
  const cached = lookupCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL) return cached.data;

  const regionLower = region.toLowerCase();

  let ilvl: number | null = null;

  // Raider.IO — fetch ilvl, RIO score, and raid progression
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

    // Parse raid progression — take the first entry's summary
    const raidProg = rioData.raid_progression;
    if (raidProg && typeof raidProg === "object") {
      const firstKey = Object.keys(raidProg)[0];
      if (firstKey) {
        raidProgress = raidProg[firstKey]?.summary ?? null;
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
