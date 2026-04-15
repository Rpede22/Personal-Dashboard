import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// In-memory cache for API lookups
const lookupCache = new Map<string, { data: unknown; ts: number }>();
const TTL = 60 * 60 * 1000; // 1 hour

async function getBlizzardToken(): Promise<string | null> {
  const clientId = process.env.BLIZZARD_CLIENT_ID;
  const clientSecret = process.env.BLIZZARD_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch(
    "https://oauth.battle.net/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    }
  );

  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token ?? null;
}

async function lookupCharacter(name: string, realm: string, region: string) {
  const cacheKey = `${region}-${realm}-${name}`.toLowerCase();
  const cached = lookupCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL) return cached.data;

  const token = await getBlizzardToken();
  const nameLower = name.toLowerCase();
  const realmSlug = realm.toLowerCase().replace(/\s+/g, "-");
  const regionLower = region.toLowerCase();

  let ilvl: number | null = null;
  let blizzardError: string | null = null;

  if (token) {
    const equipRes = await fetch(
      `https://${regionLower}.api.blizzard.com/profile/wow/character/${realmSlug}/${nameLower}/equipment?namespace=profile-${regionLower}&locale=en_US`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (equipRes.ok) {
      const equipData = await equipRes.json();
      ilvl = equipData.average_item_level ?? null;
    } else {
      blizzardError = `Blizzard API ${equipRes.status}`;
    }
  } else {
    blizzardError = "Blizzard API credentials not configured";
  }

  // Raider.IO
  const rioRes = await fetch(
    `https://raider.io/api/v1/characters/profile?region=${regionLower}&realm=${encodeURIComponent(realm)}&name=${encodeURIComponent(name)}&fields=mythic_plus_scores_by_season:current`,
    { next: { revalidate: 3600 } }
  );

  let rioScore: number | null = null;
  let rioError: string | null = null;

  if (rioRes.ok) {
    const rioData = await rioRes.json();
    rioScore =
      rioData.mythic_plus_scores_by_season?.[0]?.scores?.all ?? null;
  } else {
    rioError = `Raider.IO ${rioRes.status}`;
  }

  const result = {
    name,
    realm,
    region,
    ilvl,
    rioScore,
    errors: [blizzardError, rioError].filter(Boolean),
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
    // Return list of saved characters
    const characters = await prisma.wowCharacter.findMany({
      orderBy: { createdAt: "asc" },
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
    },
  });

  return NextResponse.json({ character }, { status: 201 });
}

// DELETE /api/wow/character?id=X
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.wowCharacter.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ ok: true });
}
